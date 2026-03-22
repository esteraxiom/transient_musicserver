# Phase 4: Job Queue

## Project Overview

`transient-musicserver` — self-hosted LAN service, downloads YouTube audio as MP3 and serves it. Stack: Bun · TypeScript · SQLite (`bun:sqlite`) · Hono · yt-dlp.

Full spec: `PLANNING/DESIGN_DOC.md`

## File Tree at Start of This Phase

```
.git/
.gitignore
package.json
bunfig.toml
src/
  types.ts          ← complete
  db.ts             ← complete
  sanitize.ts       ← complete
  ytdlp.ts          ← complete (Phase 3 done)
  jobs.ts           ← STUB (throws "not implemented")
  server.ts         ← stub
  index.ts          ← stub
  db.test.ts        ← passing
  sanitize.test.ts  ← passing
  ytdlp.test.ts     ← passing
  jobs.test.ts      ← tests written, all failing
  api.test.ts       ← failing
tests/
  fixtures/
    yt-dlp
public/
  .gitkeep
PLANNING/
  DESIGN_DOC.md
  phase-0.md  ...  phase-3.md  ...
```

## Goal of This Phase

Implement `src/jobs.ts` fully. All tests in `src/jobs.test.ts` must pass at the end.

---

## What the Job Queue Does

- Maintains an **in-memory FIFO queue** of job IDs
- Runs a **single worker** that processes jobs one at a time (no concurrency)
- For each job:
  1. Set status → `running`, record `started_at`
  2. Run the yt-dlp download
  3. On success: move file to `media/`, create a `tracks` row, set status → `finished`
  4. On failure: set status → `failed` with error message
- The worker sleeps when the queue is empty and wakes immediately when a new job is enqueued (no polling, no busy-wait)

---

## Interface

The stub in `src/jobs.ts` already defines the correct interface. Keep these types:

```typescript
export interface JobQueue {
  enqueue(jobId: string): void;
  stop(): void;
}

export type YtdlpRunner = (opts: DownloadOptions) => Promise<void>;
export type TitleFetcher = (url: string, ytdlpPath?: string) => Promise<string>;
```

The `createQueue` signature:

```typescript
export function createQueue(
  db: Database,
  opts: {
    mediaDir: string;
    tmpDir: string;
    ytdlpRunner?: YtdlpRunner;    // defaults to downloadAudio from ytdlp.ts
    titleFetcher?: TitleFetcher;  // defaults to fetchTitle from ytdlp.ts
    ytdlpPath?: string;           // passed through to the real ytdlp functions
  }
): JobQueue
```

The `ytdlpRunner` and `titleFetcher` overrides exist so tests can inject mock functions without spawning real processes.

---

## Implementation

### Wake-Up Signal

Use a promise-based signal so the worker wakes up instantly when a job is enqueued:

```typescript
let wakeResolve: () => void;
let wakeSignal = new Promise<void>(r => { wakeResolve = r; });

function resetSignal() {
  wakeSignal = new Promise<void>(r => { wakeResolve = r; });
}

// When a job is enqueued, wake the worker:
function wake() {
  wakeResolve();
  resetSignal();
}
```

### Worker Loop

```typescript
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
```

Start the worker with `worker()` (fire-and-forget — do not await it).

### `processJob(jobId: string): Promise<void>`

```
1. Fetch the job row from DB. If not found, skip.
2. updateJobStatus → 'running', started_at: Date.now()
3. Determine outputTemplate: path.join(tmpDir, `${jobId}.%(ext)s`)
4. Call ytdlpRunner with:
   - url: job.source_url
   - outputTemplate
   - onProgress: throttled DB write (see below)
5. On success:
   a. Determine title:
      - If job.requested_title is non-null and non-empty → use it
      - Otherwise → call titleFetcher(job.source_url, ytdlpPath) to get it from yt-dlp
   b. Generate filename: generateFilename(title, jobId)
   c. Locate the downloaded file: path.join(tmpDir, `${jobId}.mp3`)
   d. Move it to: path.join(mediaDir, filename)
      Use Bun.file + writer, or rename via fs.renameSync — see notes below
   e. Get file size: stat the file in mediaDir
   f. insertTrack(db, { title, filename, source_url: job.source_url, bytes, duration_seconds: null })
   g. updateJobStatus → 'finished', track_id: track.id, finished_at: Date.now()
6. On any error:
   updateJobStatus → 'failed', error: error.message or String(error)
```

### Progress Throttle

yt-dlp emits progress many times per second. Writing to SQLite on every line is wasteful. Throttle to at most one write per 250ms:

```typescript
let lastProgressWrite = 0;

const onProgress = (line: string) => {
  const now = Date.now();
  if (now - lastProgressWrite >= 250) {
    updateJobProgress(db, jobId, line);
    lastProgressWrite = now;
  }
};
```

Reset `lastProgressWrite = 0` at the start of each job.

### Moving the File

`fs.renameSync` from Node's `fs` module works in Bun:

```typescript
import { renameSync, statSync } from "fs";

// Move:
renameSync(srcPath, destPath);

// Get size:
const { size } = statSync(destPath);
```

If `renameSync` fails because source and destination are on different filesystems (unlikely for a local dev server, but possible), fall back to copy + delete. For this project, `renameSync` is sufficient.

### `stop()`

Set a `stopped` flag to `true` and wake the worker so it exits the loop:

```typescript
stop() {
  stopped = true;
  wake();
}
```

---

## Full Implementation Sketch

```typescript
import { Database } from "bun:sqlite";
import { renameSync, statSync } from "fs";
import { join } from "path";
import { getJob, updateJobStatus, updateJobProgress, insertTrack } from "./db";
import { downloadAudio, fetchTitle, type DownloadOptions } from "./ytdlp";
import { generateFilename } from "./sanitize";

export type YtdlpRunner = (opts: DownloadOptions) => Promise<void>;
export type TitleFetcher = (url: string, ytdlpPath?: string) => Promise<string>;

export interface JobQueue {
  enqueue(jobId: string): void;
  stop(): void;
}

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

  // Start the worker (fire and forget)
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
```

---

## Notes

- The worker starts automatically when `createQueue` is called. It does not need an explicit `start()` call.
- The `stop()` method is important for tests — call it in `afterEach` to prevent worker tasks from bleeding across tests.
- `generateFilename` is imported from `./sanitize`. It handles sanitization and the `__shortId.mp3` format.
- The `tmpDir` and `mediaDir` must already exist before jobs are processed. For tests, the test setup creates a temp directory and uses it for both. For production, the startup sequence (Phase 7) creates these directories.
- The injected `ytdlpRunner` in tests creates a fake `.mp3` file at the output path, mimicking what the real yt-dlp would do. Your `processJob` assumes the file ends up at `join(tmpDir, ${jobId}.mp3)` after the runner completes — the dummy runner must honor this convention.

---

## Success Criteria

Run `bun test src/jobs.test.ts` — all tests must pass.

Previously passing tests must still pass.

Commit when done:

```sh
git add src/jobs.ts
git commit -m "Phase 4: implement job queue"
```
