import type { Database } from "bun:sqlite";
import { closeSync, constants, copyFileSync, existsSync, fsyncSync, openSync, renameSync, statSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { filenameExists, getJob, updateJobStatus, updateJobProgress, insertTrack, requeueJob } from "./db";
import { downloadAudio, fetchTitle, type DownloadOptions } from "./ytdlp";
import { generateFilename, generateCustomFilename } from "./sanitize";
import { getStorageStatus } from "./storage";

export interface JobQueue {
  enqueue(jobId: string): void;
  stop(): Promise<void>;
}

export type YtdlpRunner = (opts: DownloadOptions) => Promise<void>;
export type TitleFetcher = (
  url: string,
  ytdlpPath?: string,
  signal?: AbortSignal,
  cookiesPath?: string,
  proxy?: string,
) => Promise<string>;

export function moveCompletedDownload(srcPath: string, destPath: string, jobId: string): void {
  if (existsSync(destPath)) {
    throw new Error("A file with this name already exists");
  }

  try {
    renameSync(srcPath, destPath);
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== "EXDEV") throw error;
  }

  const stagingPath = join(dirname(destPath), `.musicserver-${jobId}.partial`);
  if (existsSync(stagingPath)) {
    throw new Error("A stale finalization file already exists");
  }

  let destCreated = false;
  try {
    copyFileSync(srcPath, stagingPath, constants.COPYFILE_EXCL);
    const descriptor = openSync(stagingPath, "r");
    try {
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(stagingPath, destPath);
    destCreated = true;
    unlinkSync(srcPath);
  } catch (error) {
    for (const path of [stagingPath, destCreated ? destPath : null]) {
      if (!path) continue;
      try {
        unlinkSync(path);
      } catch (cleanupError) {
        if ((cleanupError as { code?: string }).code !== "ENOENT") {
          console.error(`failed to clean finalization artifact ${path}`, cleanupError);
        }
      }
    }
    throw error;
  }
}

export function createQueue(
  db: Database,
  opts: {
    mediaDir: string;
    tmpDir: string;
    ytdlpRunner?: YtdlpRunner;
    titleFetcher?: TitleFetcher;
    ytdlpPath?: string;
    ytdlpCookiesPath?: string;
    ytdlpProxy?: string;
    maxBytes?: number;
    minFreeBytes?: number;
  }
): JobQueue {
  const { mediaDir, tmpDir, ytdlpPath, ytdlpCookiesPath, ytdlpProxy } = opts;
  const maxBytes = opts.maxBytes ?? Number.POSITIVE_INFINITY;
  const minFreeBytes = opts.minFreeBytes ?? 0;
  const runner: YtdlpRunner = opts.ytdlpRunner ?? downloadAudio;
  const titler: TitleFetcher = opts.titleFetcher ?? fetchTitle;

  const queue: string[] = [];
  let stopped = false;
  let activeController: AbortController | null = null;

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
    const outputPath = join(tmpDir, `${jobId}.mp3`);
    let lastWrite = 0;
    let movedPath: string | null = null;
    activeController = new AbortController();

    try {
      await runner({
        url: job.source_url,
        outputTemplate,
        ytdlpPath,
        cookiesPath: ytdlpCookiesPath,
        proxy: ytdlpProxy,
        signal: activeController.signal,
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
          : await titler(job.source_url, ytdlpPath, activeController.signal, ytdlpCookiesPath, ytdlpProxy);

      const filename = job.custom_filename
        ? generateCustomFilename(title)
        : generateFilename(title, jobId);
      const srcPath = outputPath;
      const destPath = join(mediaDir, filename);

      if (job.custom_filename && filenameExists(db, filename)) {
        throw new Error("A track with this name already exists");
      }

      const { size } = statSync(srcPath);
      const storage = getStorageStatus({
        mediaDir,
        maxBytes,
        minFreeBytes,
        additionalBytes: size,
      });
      if (!storage.acceptingJobs) {
        throw new Error(storage.reason ?? "Storage policy rejected the download");
      }

      moveCompletedDownload(srcPath, destPath, jobId);
      movedPath = destPath;

      const finishJob = db.transaction(() => {
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
      });
      finishJob();
      movedPath = null;
    } catch (err) {
      for (const path of [outputPath, movedPath]) {
        if (!path) continue;
        try {
          unlinkSync(path);
        } catch (unlinkError) {
          if ((unlinkError as { code?: string }).code !== "ENOENT") {
            console.error(`failed to remove job artifact ${path}`, unlinkError);
          }
        }
      }
      if (stopped) {
        requeueJob(db, jobId);
      } else {
        updateJobStatus(db, jobId, "failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } finally {
      activeController = null;
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

  const workerPromise = worker();

  return {
    enqueue(jobId: string) {
      queue.push(jobId);
      wake();
    },
    async stop() {
      stopped = true;
      activeController?.abort();
      wake();
      await workerPromise;
    },
  };
}
