# Phase 7: Wiring and Startup

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
  ytdlp.ts          ← complete
  jobs.ts           ← complete
  server.ts         ← complete
  index.ts          ← STUB ("export {};")
  (all test files passing)
tests/
  fixtures/
    yt-dlp
public/
  index.html        ← complete
  app.js            ← complete
  styles.css        ← complete
PLANNING/
  DESIGN_DOC.md
  phase-0.md  ...  phase-6.md  ...
```

## Goal of This Phase

Implement `src/index.ts` — the entry point that wires everything together and starts the server.

All automated tests already pass. This phase produces a working, runnable server.

---

## Environment Variables

The server reads configuration from environment variables. All have sensible defaults.

| Variable   | Default          | Description                        |
|------------|------------------|------------------------------------|
| `PORT`     | `3000`           | TCP port to listen on              |
| `HOST`     | `0.0.0.0`        | Bind address                       |
| `MEDIA_DIR`| `./media`        | Directory for finished MP3 files   |
| `TMP_DIR`  | `./tmp`          | Directory for in-progress downloads|
| `DB_PATH`  | `./data/app.sqlite` | SQLite database file path       |
| `API_TOKEN`| *(unset)*        | Optional bearer token for /api/*   |

Read them via `process.env`. Bun automatically loads `.env` files if present.

---

## Startup Sequence

Perform these steps in order before starting the HTTP server:

### 1. Resolve paths

```typescript
const PORT     = Number(process.env.PORT ?? "3000");
const HOST     = process.env.HOST ?? "0.0.0.0";
const MEDIA_DIR = process.env.MEDIA_DIR ?? "./media";
const TMP_DIR   = process.env.TMP_DIR   ?? "./tmp";
const DB_PATH   = process.env.DB_PATH   ?? "./data/app.sqlite";
```

### 2. Ensure required directories exist

Use `mkdirSync` with `{ recursive: true }` — this is a no-op if the directory already exists.

```typescript
import { mkdirSync } from "fs";

mkdirSync(MEDIA_DIR, { recursive: true });
mkdirSync(TMP_DIR,   { recursive: true });
mkdirSync(dirname(DB_PATH), { recursive: true }); // ensures data/ exists
```

`dirname` comes from `"path"`.

### 3. Open the database and run migrations

```typescript
import { openDb, runMigrations } from "./db";

const db = openDb(DB_PATH);
runMigrations(db);
```

### 4. Create the job queue

```typescript
import { createQueue } from "./jobs";

const queue = createQueue(db, {
  mediaDir: MEDIA_DIR,
  tmpDir: TMP_DIR,
  // ytdlpRunner and titleFetcher are not overridden — defaults use the real yt-dlp
});
```

### 5. Create the Hono app

```typescript
import { createApp } from "./server";

const app = createApp(db, queue, { mediaDir: MEDIA_DIR });
```

### 6. Start the HTTP server

```typescript
Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

console.log(`listening on http://${HOST}:${PORT}`);
```

---

## Complete `src/index.ts`

```typescript
import { mkdirSync } from "fs";
import { dirname } from "path";
import { openDb, runMigrations } from "./db";
import { createQueue } from "./jobs";
import { createApp } from "./server";

const PORT      = Number(process.env.PORT ?? "3000");
const HOST      = process.env.HOST      ?? "0.0.0.0";
const MEDIA_DIR = process.env.MEDIA_DIR ?? "./media";
const TMP_DIR   = process.env.TMP_DIR   ?? "./tmp";
const DB_PATH   = process.env.DB_PATH   ?? "./data/app.sqlite";

// Ensure directories exist
mkdirSync(MEDIA_DIR, { recursive: true });
mkdirSync(TMP_DIR,   { recursive: true });
mkdirSync(dirname(DB_PATH), { recursive: true });

// Database
const db = openDb(DB_PATH);
runMigrations(db);

// Job queue
const queue = createQueue(db, {
  mediaDir: MEDIA_DIR,
  tmpDir: TMP_DIR,
});

// HTTP server
const app = createApp(db, queue, { mediaDir: MEDIA_DIR });

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

console.log(`listening on http://${HOST}:${PORT}`);
```

---

## `.env` (Optional, Gitignored)

Users can create a `.env` file in the project root. Bun loads it automatically.

```
PORT=3000
HOST=0.0.0.0
MEDIA_DIR=./media
TMP_DIR=./tmp
DB_PATH=./data/app.sqlite
# API_TOKEN=your-secret-here
```

---

## Smoke Test Checklist

Run the server:

```sh
bun run src/index.ts
```

Then verify:

- [ ] Server starts and prints `listening on http://0.0.0.0:3000`
- [ ] `media/`, `tmp/`, `data/` directories are created automatically
- [ ] `data/app.sqlite` is created automatically
- [ ] `GET http://localhost:3000/` returns the HTML frontend
- [ ] `POST http://localhost:3000/api/jobs` with a valid YouTube URL returns `{ jobId: "..." }`
- [ ] `GET http://localhost:3000/api/jobs/:id` reflects job status and progress
- [ ] After completion: `GET http://localhost:3000/api/tracks` lists the track
- [ ] `GET http://localhost:3000/media/<filename>.mp3` streams the file
- [ ] Server restart: tracks still appear (SQLite persistence)
- [ ] Playlist URL → 400
- [ ] Non-YouTube URL → 400
- [ ] `GET /api/jobs/nonexistent` → 404
- [ ] Path traversal: `GET /media/../data/app.sqlite` → 403 or 404

---

## Automated Tests

All tests were written in Phase 0. By the end of this phase, `bun test` must report all tests passing with zero failures.

Run the full suite as the final check:

```sh
bun test
```

---

## Commit When Done

```sh
git add src/index.ts
git commit -m "Phase 7: wire entry point and startup sequence"
```

---

## Optional Post-Ship Enhancements (Not Part of This Phase)

These are listed in the design doc under "Optional Enhancements":

- SSE endpoint instead of polling
- Thumbnail preview in UI
- MP3 metadata tags (title, artist via ffmpeg)
- Delete job history
- Display file size and duration
- Basic auth screen
