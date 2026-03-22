# Phase 0: Git Setup, Project Scaffold, and Full Test Suite

## Project Overview

`transient-musicserver` is a self-hosted LAN service that downloads YouTube videos as MP3s and serves them for local streaming. Full design spec is at `PLANNING/DESIGN_DOC.md`.

**Stack:** Bun · TypeScript · SQLite (`bun:sqlite`) · Hono · yt-dlp · ffmpeg

## Goal of This Phase

- Initialize git with `.gitignore`
- Create `package.json` and install dependencies
- Scaffold all source file stubs (so imports resolve but logic is unimplemented)
- Create a dummy `yt-dlp` shell script for use in later tests
- Write every test file for the project
- **All tests must fail at the end of this phase.** That is correct and expected.

---

## Steps

### 1. Git Init

```sh
git init
```

### 2. `.gitignore`

```
node_modules/
media/
tmp/
data/
.env
.env.local
*.mp3
```

### 3. `package.json`

```json
{
  "name": "transient-musicserver",
  "version": "0.1.0",
  "module": "src/index.ts",
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.7.0"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Run `bun install`.

### 4. `bunfig.toml`

```toml
[test]
timeout = 15000
```

### 5. Directory Structure

Create these directories. Use empty `.gitkeep` files so git tracks them:

- `src/` — all TypeScript source
- `public/` — static frontend files
- `tests/fixtures/` — test support files

These are gitignored and created at runtime (do not create or commit them):
- `media/`
- `tmp/`
- `data/`

### 6. Dummy `yt-dlp` Script

Create `tests/fixtures/yt-dlp`. This is a shell script that mimics yt-dlp for tests — no real network, no real ffmpeg needed.

```sh
#!/bin/sh
# Fake yt-dlp for testing purposes

# Handle --print "%(title)s" mode
if echo "$*" | grep -q -- '--print'; then
  echo "Test Song Title"
  exit 0
fi

# Simulate progress output to stderr
echo "[download]   0.0% of 5.00MiB" >&2
sleep 0.05
echo "[download]  25.0% of 5.00MiB at 1.00MiB/s ETA 00:03" >&2
sleep 0.05
echo "[download]  50.0% of 5.00MiB at 1.00MiB/s ETA 00:02" >&2
sleep 0.05
echo "[download] 100% of 5.00MiB" >&2

# Find the -o flag and create a dummy file at that path
OUTPUT=""
NEXT=false
for arg in "$@"; do
  if $NEXT; then
    OUTPUT="$arg"
    NEXT=false
  fi
  if [ "$arg" = "-o" ]; then
    NEXT=true
  fi
done

if [ -n "$OUTPUT" ]; then
  # Replace %(ext)s with mp3
  OUTFILE=$(echo "$OUTPUT" | sed 's/%(ext)s/mp3/g')
  mkdir -p "$(dirname "$OUTFILE")"
  # Write minimal bytes so the file exists and has a nonzero size
  printf '\xff\xfb\x90\x00' > "$OUTFILE"
fi

exit 0
```

Make it executable:

```sh
chmod +x tests/fixtures/yt-dlp
```

### 7. Source File Stubs

Create each source file exporting the correct names with the right type signatures, but throwing `new Error("not implemented")` for all function bodies. This allows test imports to resolve at module load time, but every test will fail at runtime.

---

**`src/types.ts`** — This file is complete. No logic, no stubs needed.

```typescript
export type JobStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface Job {
  id: string;
  source_url: string;
  requested_title: string | null;
  status: JobStatus;
  progress: string | null;
  track_id: string | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface Track {
  id: string;
  title: string;
  filename: string;
  source_url: string;
  created_at: number;
  bytes: number;
  duration_seconds: number | null;
}
```

---

**`src/db.ts`**

```typescript
import type { Database } from "bun:sqlite";
import type { Job, JobStatus, Track } from "./types";

export function openDb(path: string): Database {
  throw new Error("not implemented");
}
export function runMigrations(db: Database): void {
  throw new Error("not implemented");
}
export function insertJob(
  db: Database,
  fields: { source_url: string; requested_title: string | null }
): Job {
  throw new Error("not implemented");
}
export function getJob(db: Database, id: string): Job | null {
  throw new Error("not implemented");
}
export function updateJobStatus(
  db: Database,
  id: string,
  status: JobStatus,
  extra?: Partial<Pick<Job, 'track_id' | 'error' | 'started_at' | 'finished_at'>>
): void {
  throw new Error("not implemented");
}
export function updateJobProgress(db: Database, id: string, progress: string): void {
  throw new Error("not implemented");
}
export function insertTrack(
  db: Database,
  fields: {
    title: string;
    filename: string;
    source_url: string;
    bytes: number;
    duration_seconds: number | null;
  }
): Track {
  throw new Error("not implemented");
}
export function getTrack(db: Database, id: string): Track | null {
  throw new Error("not implemented");
}
export function getAllTracks(db: Database): Track[] {
  throw new Error("not implemented");
}
export function deleteTrack(db: Database, id: string): boolean {
  throw new Error("not implemented");
}
```

---

**`src/sanitize.ts`**

```typescript
export function sanitizeFilename(name: string): string {
  throw new Error("not implemented");
}
export function generateFilename(title: string, jobId: string): string {
  throw new Error("not implemented");
}
export function isAllowedUrl(url: string): boolean {
  throw new Error("not implemented");
}
export function isPlaylistUrl(url: string): boolean {
  throw new Error("not implemented");
}
```

---

**`src/ytdlp.ts`**

```typescript
export interface DownloadOptions {
  url: string;
  outputTemplate: string; // e.g. "tmp/jobId.%(ext)s"
  onProgress?: (line: string) => void;
  ytdlpPath?: string;     // override binary path, used in tests
}

export function parseProgressLine(line: string): string | null {
  throw new Error("not implemented");
}
export async function fetchTitle(url: string, ytdlpPath?: string): Promise<string> {
  throw new Error("not implemented");
}
export async function downloadAudio(opts: DownloadOptions): Promise<void> {
  throw new Error("not implemented");
}
```

---

**`src/jobs.ts`**

```typescript
import type { Database } from "bun:sqlite";
import type { DownloadOptions } from "./ytdlp";

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
  throw new Error("not implemented");
}
```

---

**`src/server.ts`**

```typescript
import type { Database } from "bun:sqlite";
import type { JobQueue } from "./jobs";

export function createApp(db: Database, queue: JobQueue, opts?: { mediaDir?: string }) {
  throw new Error("not implemented");
}
```

---

**`src/index.ts`**

```typescript
// Entry point — implemented in Phase 7
export {};
```

---

### 8. Test Files

Write all five test files now. They will all fail because the stubs throw "not implemented."

---

**`src/sanitize.test.ts`**

```typescript
import { test, expect, describe } from "bun:test";
import { sanitizeFilename, generateFilename, isAllowedUrl, isPlaylistUrl } from "./sanitize";

describe("sanitizeFilename", () => {
  test("removes path separator characters", () => {
    expect(sanitizeFilename("my/song")).toBe("mysong");
    expect(sanitizeFilename("my\\song")).toBe("mysong");
  });

  test("removes other forbidden characters", () => {
    expect(sanitizeFilename('file:name*?"<>|')).toBe("filename");
  });

  test("removes control characters", () => {
    expect(sanitizeFilename("song\x00name\x1fname")).toBe("songnamename");
  });

  test("collapses multiple whitespace to single space", () => {
    expect(sanitizeFilename("my   song   title")).toBe("my song title");
  });

  test("trims leading and trailing whitespace", () => {
    expect(sanitizeFilename("  my song  ")).toBe("my song");
  });

  test("limits to 120 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(120);
  });

  test("falls back to 'track' for empty result", () => {
    expect(sanitizeFilename("///")).toBe("track");
    expect(sanitizeFilename("   ")).toBe("track");
    expect(sanitizeFilename("")).toBe("track");
  });

  test("preserves normal characters", () => {
    expect(sanitizeFilename("My Favorite Song (Live)")).toBe("My Favorite Song (Live)");
  });
});

describe("generateFilename", () => {
  test("produces safeTitle__shortId.mp3 format", () => {
    const filename = generateFilename("My Song", "550e8400-e29b-41d4");
    expect(filename).toBe("My Song__550e8400.mp3");
  });

  test("sanitizes the title portion", () => {
    const filename = generateFilename("My/Song", "abc12345-xxxx");
    expect(filename).not.toContain("/");
    expect(filename).toMatch(/\.mp3$/);
  });

  test("uses first 8 chars of job ID", () => {
    const filename = generateFilename("Song", "abcdefgh-1234-5678");
    expect(filename).toContain("__abcdefgh");
  });
});

describe("isAllowedUrl", () => {
  test("allows youtube.com", () => {
    expect(isAllowedUrl("https://youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows www.youtube.com", () => {
    expect(isAllowedUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows m.youtube.com", () => {
    expect(isAllowedUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows music.youtube.com", () => {
    expect(isAllowedUrl("https://music.youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows youtu.be", () => {
    expect(isAllowedUrl("https://youtu.be/abc123")).toBe(true);
  });
  test("rejects other domains", () => {
    expect(isAllowedUrl("https://vimeo.com/video")).toBe(false);
    expect(isAllowedUrl("https://evil.youtube.com.hacker.io/x")).toBe(false);
  });
  test("rejects invalid URLs", () => {
    expect(isAllowedUrl("not-a-url")).toBe(false);
    expect(isAllowedUrl("")).toBe(false);
  });
});

describe("isPlaylistUrl", () => {
  test("detects list= parameter", () => {
    expect(isPlaylistUrl("https://www.youtube.com/watch?v=abc&list=PLxxx")).toBe(true);
  });
  test("returns false for regular video URLs", () => {
    expect(isPlaylistUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
  });
  test("returns false for youtu.be links without list", () => {
    expect(isPlaylistUrl("https://youtu.be/abc123")).toBe(false);
  });
});
```

---

**`src/db.test.ts`**

```typescript
import { test, expect, describe, beforeEach } from "bun:test";
import { openDb, runMigrations, insertJob, getJob, updateJobStatus, updateJobProgress, insertTrack, getTrack, getAllTracks, deleteTrack } from "./db";
import type { Database } from "bun:sqlite";

let db: Database;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

describe("jobs", () => {
  test("insertJob creates a job with queued status", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("queued");
    expect(job.source_url).toBe("https://youtube.com/watch?v=test");
    expect(job.requested_title).toBeNull();
    expect(job.created_at).toBeGreaterThan(0);
    expect(job.started_at).toBeNull();
    expect(job.finished_at).toBeNull();
    expect(job.error).toBeNull();
    expect(job.track_id).toBeNull();
  });

  test("insertJob stores requested_title", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: "My Song" });
    expect(job.requested_title).toBe("My Song");
  });

  test("getJob retrieves an existing job", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    const retrieved = getJob(db, job.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(job.id);
  });

  test("getJob returns null for nonexistent id", () => {
    expect(getJob(db, "nonexistent-id")).toBeNull();
  });

  test("updateJobStatus transitions to running with started_at", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    const now = Date.now();
    updateJobStatus(db, job.id, "running", { started_at: now });
    const updated = getJob(db, job.id);
    expect(updated!.status).toBe("running");
    expect(updated!.started_at).toBe(now);
  });

  test("updateJobStatus transitions to finished with track_id", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    const now = Date.now();
    updateJobStatus(db, job.id, "finished", { track_id: "track-uuid-123", finished_at: now });
    const updated = getJob(db, job.id);
    expect(updated!.status).toBe("finished");
    expect(updated!.track_id).toBe("track-uuid-123");
    expect(updated!.finished_at).toBe(now);
  });

  test("updateJobStatus transitions to failed with error", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    updateJobStatus(db, job.id, "failed", { error: "yt-dlp exited with code 1" });
    const updated = getJob(db, job.id);
    expect(updated!.status).toBe("failed");
    expect(updated!.error).toBe("yt-dlp exited with code 1");
  });

  test("updateJobProgress updates progress field", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    updateJobProgress(db, job.id, "[download]  50.0% of 5.00MiB");
    const updated = getJob(db, job.id);
    expect(updated!.progress).toBe("[download]  50.0% of 5.00MiB");
  });
});

describe("tracks", () => {
  test("insertTrack creates a track with all fields", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: 180,
    });
    expect(track.id).toBeTruthy();
    expect(track.title).toBe("Test Song");
    expect(track.filename).toBe("Test_Song__abc.mp3");
    expect(track.source_url).toBe("https://youtube.com/watch?v=test");
    expect(track.bytes).toBe(1024);
    expect(track.duration_seconds).toBe(180);
    expect(track.created_at).toBeGreaterThan(0);
  });

  test("insertTrack allows null duration_seconds", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 512,
      duration_seconds: null,
    });
    expect(track.duration_seconds).toBeNull();
  });

  test("getTrack retrieves a track by id", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });
    const retrieved = getTrack(db, track.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(track.id);
    expect(retrieved!.title).toBe("Test Song");
  });

  test("getTrack returns null for nonexistent id", () => {
    expect(getTrack(db, "nonexistent")).toBeNull();
  });

  test("getAllTracks returns all inserted tracks", () => {
    insertTrack(db, { title: "A", filename: "a.mp3", source_url: "https://youtube.com/watch?v=a", bytes: 100, duration_seconds: null });
    insertTrack(db, { title: "B", filename: "b.mp3", source_url: "https://youtube.com/watch?v=b", bytes: 100, duration_seconds: null });
    const tracks = getAllTracks(db);
    expect(tracks.length).toBe(2);
    const titles = tracks.map(t => t.title);
    expect(titles).toContain("A");
    expect(titles).toContain("B");
  });

  test("getAllTracks returns empty array when no tracks", () => {
    expect(getAllTracks(db)).toEqual([]);
  });

  test("deleteTrack removes the track and returns true", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });
    expect(deleteTrack(db, track.id)).toBe(true);
    expect(getTrack(db, track.id)).toBeNull();
  });

  test("deleteTrack returns false for nonexistent id", () => {
    expect(deleteTrack(db, "nonexistent")).toBe(false);
  });
});
```

---

**`src/ytdlp.test.ts`**

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { parseProgressLine, fetchTitle, downloadAudio } from "./ytdlp";
import { join } from "path";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const FIXTURE_YTDLP = join(import.meta.dir, "../tests/fixtures/yt-dlp");

describe("parseProgressLine", () => {
  test("returns the line when it contains a download percentage", () => {
    const line = "[download]  43.2% of 5.00MiB at 1.00MiB/s ETA 00:03";
    expect(parseProgressLine(line)).toBe(line);
  });

  test("captures 100% completion line", () => {
    const line = "[download] 100% of 5.00MiB";
    expect(parseProgressLine(line)).toBe(line);
  });

  test("captures 0.0% start line", () => {
    const line = "[download]   0.0% of 5.00MiB";
    expect(parseProgressLine(line)).toBe(line);
  });

  test("returns null for non-download lines", () => {
    expect(parseProgressLine("[info] Downloading video")).toBeNull();
    expect(parseProgressLine("[ffmpeg] Converting audio")).toBeNull();
    expect(parseProgressLine("[youtube] Extracting URL")).toBeNull();
    expect(parseProgressLine("")).toBeNull();
  });
});

describe("fetchTitle (using dummy yt-dlp)", () => {
  test("returns the title string from the dummy script", async () => {
    const title = await fetchTitle("https://www.youtube.com/watch?v=test", FIXTURE_YTDLP);
    expect(typeof title).toBe("string");
    expect(title.length).toBeGreaterThan(0);
    expect(title).toBe("Test Song Title");
  });
});

describe("downloadAudio (using dummy yt-dlp)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ytdlp-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates an output .mp3 file at the expected path", async () => {
    const outputTemplate = join(tmpDir, "job123.%(ext)s");
    await downloadAudio({
      url: "https://www.youtube.com/watch?v=test",
      outputTemplate,
      ytdlpPath: FIXTURE_YTDLP,
    });
    expect(existsSync(join(tmpDir, "job123.mp3"))).toBe(true);
  });

  test("calls onProgress with progress lines", async () => {
    const progressLines: string[] = [];
    await downloadAudio({
      url: "https://www.youtube.com/watch?v=test",
      outputTemplate: join(tmpDir, "job456.%(ext)s"),
      ytdlpPath: FIXTURE_YTDLP,
      onProgress: (line) => progressLines.push(line),
    });
    expect(progressLines.length).toBeGreaterThan(0);
    expect(progressLines.some(l => l.includes("%"))).toBe(true);
  });

  test("rejects when the binary does not exist", async () => {
    await expect(
      downloadAudio({
        url: "https://www.youtube.com/watch?v=test",
        outputTemplate: join(tmpDir, "fail.%(ext)s"),
        ytdlpPath: "/nonexistent/yt-dlp-binary",
      })
    ).rejects.toThrow();
  });
});
```

---

**`src/jobs.test.ts`**

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { openDb, runMigrations, insertJob, getJob } from "./db";
import { createQueue } from "./jobs";
import type { Database } from "bun:sqlite";
import type { DownloadOptions } from "./ytdlp";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
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
});
```

---

**`src/api.test.ts`**

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { openDb, runMigrations, insertTrack } from "./db";
import { createApp } from "./server";
import { createQueue } from "./jobs";
import type { Database } from "bun:sqlite";
import type { DownloadOptions } from "./ytdlp";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

let db: Database;
let app: ReturnType<typeof createApp>;
let tmpDir: string;
let queue: ReturnType<typeof createQueue>;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  tmpDir = mkdtempSync(join(tmpdir(), "api-test-"));

  queue = createQueue(db, {
    mediaDir: tmpDir,
    tmpDir,
    ytdlpRunner: async (opts: DownloadOptions) => {
      const outputPath = opts.outputTemplate.replace("%(ext)s", "mp3");
      await Bun.write(outputPath, new Uint8Array([0xff, 0xfb]));
    },
    titleFetcher: async () => "Test Title",
  });

  app = createApp(db, queue, { mediaDir: tmpDir });
});

afterEach(() => {
  queue?.stop();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /api/jobs", () => {
  test("returns 201 and jobId for a valid YouTube URL", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { jobId: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId.length).toBeGreaterThan(0);
  });

  test("returns 201 with optional custom title", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc123", title: "My Custom Name" }),
    });
    expect(res.status).toBe(201);
  });

  test("returns 400 for non-YouTube URL", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://vimeo.com/video/123" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 for playlist URL", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc&list=PLxxxxx" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 when url field is missing", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No URL provided" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 for empty body", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs/:id", () => {
  test("returns job status for a known job", async () => {
    const postRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc123" }),
    });
    const { jobId } = await postRes.json() as { jobId: string };

    const res = await app.request(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; status: string };
    expect(body.id).toBe(jobId);
    expect(["queued", "running", "finished", "failed"]).toContain(body.status);
  });

  test("returns 404 for nonexistent job id", async () => {
    const res = await app.request("/api/jobs/definitely-not-a-real-id");
    expect(res.status).toBe(404);
  });

  test("includes track info when job is finished", async () => {
    // Seed a finished job with a linked track
    const track = insertTrack(db, {
      title: "My Track",
      filename: "my_track__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });

    const { insertJob, updateJobStatus } = await import("./db");
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    updateJobStatus(db, job.id, "finished", { track_id: track.id, finished_at: Date.now() });

    const res = await app.request(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; track: { title: string; url: string } };
    expect(body.status).toBe("finished");
    expect(body.track).toBeDefined();
    expect(body.track.title).toBe("My Track");
    expect(body.track.url).toMatch(/\/media\/my_track__abc\.mp3$/);
  });
});

describe("GET /api/tracks", () => {
  test("returns empty array when no tracks exist", async () => {
    const res = await app.request("/api/tracks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  test("returns tracks with expected shape", async () => {
    await Bun.write(join(tmpDir, "song__abc12345.mp3"), new Uint8Array([0xff]));
    insertTrack(db, {
      title: "My Song",
      filename: "song__abc12345.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });

    const res = await app.request("/api/tracks");
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; title: string; url: string; createdAt: number }>;
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("My Song");
    expect(body[0].url).toMatch(/\/media\/song__abc12345\.mp3$/);
    expect(typeof body[0].createdAt).toBe("number");
  });
});

describe("DELETE /api/tracks/:id", () => {
  test("returns 204 and removes the track", async () => {
    await Bun.write(join(tmpDir, "song__del.mp3"), new Uint8Array([0xff]));
    const track = insertTrack(db, {
      title: "To Delete",
      filename: "song__del.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 512,
      duration_seconds: null,
    });

    const res = await app.request(`/api/tracks/${track.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    // Verify it's gone from the list
    const listRes = await app.request("/api/tracks");
    const tracks = await listRes.json() as unknown[];
    expect(tracks).toHaveLength(0);
  });

  test("returns 404 for a nonexistent track id", async () => {
    const res = await app.request("/api/tracks/nonexistent-track-id", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
```

---

### 9. Initial Commit

```sh
git add -A
git commit -m "Phase 0: scaffold, stubs, and full test suite (all tests failing)"
```

## Success Criteria

- `bun install` completes without errors
- `bun test` runs and reports failures — it must not crash the test runner itself
- All 5 test files are present and importable
- Git repo has one clean commit
- `tests/fixtures/yt-dlp` is executable
- No `media/`, `tmp/`, or `data/` directories are committed
