# Phase 3: yt-dlp Wrapper

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
  sanitize.ts       ← complete (Phase 2 done)
  ytdlp.ts          ← STUB (all functions throw "not implemented")
  jobs.ts           ← stub
  server.ts         ← stub
  index.ts          ← stub
  db.test.ts        ← passing
  sanitize.test.ts  ← passing
  ytdlp.test.ts     ← tests written, all failing
  jobs.test.ts      ← failing
  api.test.ts       ← failing
tests/
  fixtures/
    yt-dlp          ← executable shell script that mimics yt-dlp output
public/
  .gitkeep
PLANNING/
  DESIGN_DOC.md
  phase-0.md  phase-1.md  phase-2.md  ...
```

## Goal of This Phase

Implement `src/ytdlp.ts` fully. All tests in `src/ytdlp.test.ts` must pass at the end.

The tests use the dummy `yt-dlp` script at `tests/fixtures/yt-dlp` — no real network or ffmpeg required.

---

## The Dummy Script

`tests/fixtures/yt-dlp` is a shell script. Its behavior:

- When called with `--print` in the arguments: prints `"Test Song Title"` to stdout and exits 0.
- Otherwise: writes four progress lines to stderr (0%, 25%, 50%, 100%), creates a small file at the path given by the `-o` flag (replacing `%(ext)s` with `mp3`), then exits 0.

Tests pass `ytdlpPath: FIXTURE_YTDLP` to override the binary. Your implementation must respect this override.

---

## Implementation

### Types

```typescript
export interface DownloadOptions {
  url: string;
  outputTemplate: string; // e.g. "/tmp/jobs/job123.%(ext)s"
  onProgress?: (line: string) => void;
  ytdlpPath?: string;     // override yt-dlp binary path; defaults to "yt-dlp"
}
```

---

### `parseProgressLine(line: string): string | null`

Returns the line unchanged if it is a download progress line, otherwise `null`.

A download progress line is one that:
- Starts with `[download]`
- Contains a `%` character

```typescript
export function parseProgressLine(line: string): string | null {
  if (line.startsWith("[download]") && line.includes("%")) {
    return line;
  }
  return null;
}
```

---

### `fetchTitle(url: string, ytdlpPath?: string): Promise<string>`

Spawns yt-dlp to retrieve the video title without downloading anything.

Command:
```
yt-dlp --no-playlist --print "%(title)s" <url>
```

- Capture stdout
- Trim whitespace from the result
- Return the title string
- Throw if the process exits with a non-zero code

```typescript
export async function fetchTitle(url: string, ytdlpPath = "yt-dlp"): Promise<string> {
  const proc = Bun.spawn(
    [ytdlpPath, "--no-playlist", "--print", "%(title)s", url],
    { stdout: "pipe", stderr: "ignore" }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`yt-dlp exited with code ${exitCode} during title fetch`);
  }

  const text = await new Response(proc.stdout).text();
  return text.trim();
}
```

---

### `downloadAudio(opts: DownloadOptions): Promise<void>`

Spawns yt-dlp to download and transcode audio to MP3.

**Command:**
```
yt-dlp --extract-audio --audio-format mp3 --no-playlist --newline -o <outputTemplate> <url>
```

**Behavior:**
- Pipe stderr (progress lines come from stderr)
- For each line read from stderr:
  - Call `parseProgressLine(line)` — if non-null, call `opts.onProgress?.(line)`
- Wait for process to exit
- Throw if exit code is non-zero

**Reading stderr line by line:**

Use Bun's `ReadableStream` API. The cleanest approach is to use `proc.stderr` as a reader and split on newlines.

```typescript
export async function downloadAudio(opts: DownloadOptions): Promise<void> {
  const ytdlpPath = opts.ytdlpPath ?? "yt-dlp";

  const proc = Bun.spawn(
    [
      ytdlpPath,
      "--extract-audio",
      "--audio-format", "mp3",
      "--no-playlist",
      "--newline",
      "-o", opts.outputTemplate,
      opts.url,
    ],
    { stdout: "ignore", stderr: "pipe" }
  );

  // Read stderr line by line
  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // keep incomplete last chunk

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = parseProgressLine(trimmed);
      if (parsed) opts.onProgress?.(parsed);
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    const parsed = parseProgressLine(buffer.trim());
    if (parsed) opts.onProgress?.(parsed);
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`yt-dlp exited with code ${exitCode}`);
  }
}
```

**Handling a missing binary:**

When `ytdlpPath` points to a nonexistent file, `Bun.spawn()` throws synchronously with a system error. The `downloadAudio` function is `async`, so this becomes a rejected promise automatically. The test expects `.rejects.toThrow()` — this is satisfied as long as you do not catch and swallow the error.

---

## Notes

- `Bun.spawn()` docs: https://bun.sh/docs/api/spawn — the subprocess API used here.
- `proc.stderr` is a `ReadableStream<Uint8Array>` when `stderr: "pipe"`.
- `proc.exited` is a `Promise<number>` that resolves to the exit code.
- Do not use `proc.stdout` for progress — yt-dlp writes progress to stderr.
- `--newline` flag tells yt-dlp to emit progress on separate lines (not carriage return overwrite). This makes line parsing straightforward.
- The `ytdlpPath` parameter is used by tests to point to `tests/fixtures/yt-dlp` instead of the system binary. Always use it when provided.

---

## Success Criteria

Run `bun test src/ytdlp.test.ts` — all tests must pass.

Previously passing tests (`db.test.ts`, `sanitize.test.ts`) must still pass.

Commit when done:

```sh
git add src/ytdlp.ts
git commit -m "Phase 3: implement yt-dlp wrapper"
```
