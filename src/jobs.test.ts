import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { openDb, runMigrations, insertJob, getJob } from "./db";
import { createQueue, moveCompletedDownload } from "./jobs";
import type { Database } from "bun:sqlite";
import type { DownloadOptions } from "./ytdlp";
import { join } from "path";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";

let db: Database;
let tmpDir: string;
let queue: ReturnType<typeof createQueue>;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  tmpDir = mkdtempSync(join(tmpdir(), "jobs-test-"));
});

afterEach(() => {
  queue?.stop();
  rmSync(tmpDir, { recursive: true, force: true });
});

function waitForJob(id: string, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poll);
      reject(new Error(`Job ${id} did not complete within ${timeoutMs}ms`));
    }, timeoutMs);
    const poll = setInterval(() => {
      const j = getJob(db, id);
      if (j?.status === "finished" || j?.status === "failed") {
        clearInterval(poll);
        clearTimeout(deadline);
        resolve();
      }
    }, 50);
  });
}

function makeSuccessRunner(): (opts: DownloadOptions) => Promise<void> {
  return async (opts) => {
    const outputPath = opts.outputTemplate.replace("%(ext)s", "mp3");
    await Bun.write(outputPath, new Uint8Array([0xff, 0xfb, 0x90, 0x00]));
    opts.onProgress?.("[download] 100% of 1.00MiB");
  };
}

function makeFailRunner(): (opts: DownloadOptions) => Promise<void> {
  return async () => {
    throw new Error("simulated download failure");
  };
}

test("moveCompletedDownload finalizes across filesystems", () => {
  const sourceDir = mkdtempSync(join(tmpdir(), "jobs-cross-device-source-"));
  const mediaDir = mkdtempSync("/dev/shm/jobs-cross-device-media-");
  const sourcePath = join(sourceDir, "job.mp3");
  const destPath = join(mediaDir, "track.mp3");
  const jobId = "a929494d-9f43-4f63-9e2b-4f0c3cb9f2b8";

  try {
    expect(statSync(sourceDir).dev).not.toBe(statSync(mediaDir).dev);
    writeFileSync(sourcePath, "audio-bytes");
    moveCompletedDownload(sourcePath, destPath, jobId);

    expect(existsSync(sourcePath)).toBe(false);
    expect(readFileSync(destPath, "utf8")).toBe("audio-bytes");
    expect(existsSync(join(mediaDir, `.musicserver-${jobId}.partial`))).toBe(false);
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
    rmSync(mediaDir, { recursive: true, force: true });
  }
});

describe("createQueue", () => {
  test("processes a queued job to finished status", async () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: "My Song" });

    queue = createQueue(db, {
      mediaDir: tmpDir,
      tmpDir,
      ytdlpRunner: makeSuccessRunner(),
      titleFetcher: async () => "Fetched Title",
    });

    queue.enqueue(job.id);
    await waitForJob(job.id);

    const finished = getJob(db, job.id);
    expect(finished!.status).toBe("finished");
    expect(finished!.track_id).toBeTruthy();
    expect(finished!.finished_at).toBeGreaterThan(0);
  });

  test("uses requested_title when provided", async () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: "Custom Name" });

    queue = createQueue(db, {
      mediaDir: tmpDir,
      tmpDir,
      ytdlpRunner: makeSuccessRunner(),
      titleFetcher: async () => "Should Not Be Used",
    });

    queue.enqueue(job.id);
    await waitForJob(job.id);

    const finished = getJob(db, job.id);
    expect(finished!.status).toBe("finished");
    // The track's title should be the custom name
    const { getAllTracks } = await import("./db");
    const tracks = getAllTracks(db);
    expect(tracks[0].title).toBe("Custom Name");
  });

  test("marks job as failed on runner error", async () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });

    queue = createQueue(db, {
      mediaDir: tmpDir,
      tmpDir,
      ytdlpRunner: makeFailRunner(),
      titleFetcher: async () => "Title",
    });

    queue.enqueue(job.id);
    await waitForJob(job.id);

    const failed = getJob(db, job.id);
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBeTruthy();
  });

  test("transitions job through queued → running → finished", async () => {
    const statuses: string[] = [];
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    statuses.push(getJob(db, job.id)!.status); // queued

    let resolveDownload!: () => void;
    const downloadStarted = new Promise<void>(r => resolveDownload = r);

    const slowRunner = async (opts: DownloadOptions) => {
      resolveDownload();
      await new Promise(r => setTimeout(r, 100));
      const outputPath = opts.outputTemplate.replace("%(ext)s", "mp3");
      await Bun.write(outputPath, new Uint8Array([0xff, 0xfb]));
    };

    queue = createQueue(db, {
      mediaDir: tmpDir,
      tmpDir,
      ytdlpRunner: slowRunner,
      titleFetcher: async () => "Title",
    });

    queue.enqueue(job.id);
    await downloadStarted;
    statuses.push(getJob(db, job.id)!.status); // running

    await waitForJob(job.id);
    statuses.push(getJob(db, job.id)!.status); // finished

    expect(statuses).toEqual(["queued", "running", "finished"]);
  });

  test("processes multiple jobs sequentially in enqueue order", async () => {
    const job1 = insertJob(db, { source_url: "https://youtube.com/watch?v=aaa", requested_title: "Song A" });
    const job2 = insertJob(db, { source_url: "https://youtube.com/watch?v=bbb", requested_title: "Song B" });

    const processedUrls: string[] = [];

    const orderedRunner = async (opts: DownloadOptions) => {
      processedUrls.push(opts.url);
      const outputPath = opts.outputTemplate.replace("%(ext)s", "mp3");
      await Bun.write(outputPath, new Uint8Array([0xff, 0xfb]));
    };

    queue = createQueue(db, {
      mediaDir: tmpDir,
      tmpDir,
      ytdlpRunner: orderedRunner,
      titleFetcher: async () => "Title",
    });

    queue.enqueue(job1.id);
    queue.enqueue(job2.id);

    await waitForJob(job1.id);
    await waitForJob(job2.id);

    expect(getJob(db, job1.id)!.status).toBe("finished");
    expect(getJob(db, job2.id)!.status).toBe("finished");
    expect(processedUrls[0]).toBe("https://youtube.com/watch?v=aaa");
    expect(processedUrls[1]).toBe("https://youtube.com/watch?v=bbb");
  });

  test("fails and removes output when finalization would cross the media cap", async () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=large", requested_title: "Large" });
    const mediaDir = join(tmpDir, "media");
    const downloadDir = join(tmpDir, "downloads");
    mkdirSync(mediaDir);
    mkdirSync(downloadDir);
    queue = createQueue(db, {
      mediaDir,
      tmpDir: downloadDir,
      maxBytes: 3,
      minFreeBytes: 0,
      ytdlpRunner: makeSuccessRunner(),
      titleFetcher: async () => "Large",
    });

    queue.enqueue(job.id);
    await waitForJob(job.id);

    expect(getJob(db, job.id)!.status).toBe("failed");
    expect(getJob(db, job.id)!.error).toContain("library storage limit");
    expect((await import("fs")).existsSync(join(downloadDir, `${job.id}.mp3`))).toBe(false);
  });

  test("does not overwrite a custom filename reserved by an earlier queued job", async () => {
    const first = insertJob(db, {
      source_url: "https://youtube.com/watch?v=first",
      requested_title: "Same Name",
      custom_filename: true,
    });
    const second = insertJob(db, {
      source_url: "https://youtube.com/watch?v=second",
      requested_title: "Same Name",
      custom_filename: true,
    });
    const mediaDir = join(tmpDir, "media");
    const downloadDir = join(tmpDir, "downloads");
    mkdirSync(mediaDir);
    mkdirSync(downloadDir);
    queue = createQueue(db, {
      mediaDir,
      tmpDir: downloadDir,
      ytdlpRunner: makeSuccessRunner(),
      titleFetcher: async () => "Same Name",
    });

    queue.enqueue(first.id);
    queue.enqueue(second.id);
    await waitForJob(first.id);
    await waitForJob(second.id);

    expect(getJob(db, first.id)!.status).toBe("finished");
    expect(getJob(db, second.id)!.status).toBe("failed");
    expect(getJob(db, second.id)!.error).toContain("already exists");
    expect((await import("./db")).getAllTracks(db)).toHaveLength(1);
  });
});
