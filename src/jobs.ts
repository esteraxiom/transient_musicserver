import type { Database } from "bun:sqlite";
import { renameSync, statSync } from "fs";
import { join } from "path";
import { getJob, updateJobStatus, updateJobProgress, insertTrack } from "./db";
import { downloadAudio, fetchTitle, type DownloadOptions } from "./ytdlp";
import { generateFilename } from "./sanitize";

export interface JobQueue {
  enqueue(jobId: string): void;
  stop(): void;
}

export type YtdlpRunner = (opts: DownloadOptions) => Promise<void>;
export type TitleFetcher = (url: string, ytdlpPath?: string) => Promise<string>;

export function createQueue(
  db: Database,
  opts: {
    mediaDir: string;
    tmpDir: string;
    ytdlpRunner?: YtdlpRunner;
    titleFetcher?: TitleFetcher;
    ytdlpPath?: string;
  }
): JobQueue {
  const { mediaDir, tmpDir, ytdlpPath } = opts;
  const runner: YtdlpRunner = opts.ytdlpRunner ?? downloadAudio;
  const titler: TitleFetcher = opts.titleFetcher ?? fetchTitle;

  const queue: string[] = [];
  let stopped = false;

  let wakeResolve!: () => void;
  let wakeSignal = newSignal();

  function newSignal(): Promise<void> {
    return new Promise<void>(r => { wakeResolve = r; });
  }

  function wake() {
    wakeResolve();
    wakeSignal = newSignal();
  }

  async function processJob(jobId: string): Promise<void> {
    const job = getJob(db, jobId);
    if (!job) return;

    updateJobStatus(db, jobId, "running", { started_at: Date.now() });

    const outputTemplate = join(tmpDir, `${jobId}.%(ext)s`);
    let lastWrite = 0;

    try {
      await runner({
        url: job.source_url,
        outputTemplate,
        ytdlpPath,
        onProgress: (line) => {
          const now = Date.now();
          if (now - lastWrite >= 250) {
            updateJobProgress(db, jobId, line);
            lastWrite = now;
          }
        },
      });

      const title =
        job.requested_title?.trim()
          ? job.requested_title
          : await titler(job.source_url, ytdlpPath);

      const filename = generateFilename(title, jobId);
      const srcPath = join(tmpDir, `${jobId}.mp3`);
      const destPath = join(mediaDir, filename);

      renameSync(srcPath, destPath);

      const { size } = statSync(destPath);

      const track = insertTrack(db, {
        title,
        filename,
        source_url: job.source_url,
        bytes: size,
        duration_seconds: null,
      });

      updateJobStatus(db, jobId, "finished", {
        track_id: track.id,
        finished_at: Date.now(),
      });
    } catch (err) {
      updateJobStatus(db, jobId, "failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function worker() {
    while (!stopped) {
      if (queue.length === 0) {
        await wakeSignal;
        continue;
      }
      const jobId = queue.shift()!;
      await processJob(jobId);
    }
  }

  worker();

  return {
    enqueue(jobId: string) {
      queue.push(jobId);
      wake();
    },
    stop() {
      stopped = true;
      wake();
    },
  };
}
