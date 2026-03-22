# Phase 5: HTTP Server and API

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
  jobs.ts           ← complete (Phase 4 done)
  server.ts         ← STUB (throws "not implemented")
  index.ts          ← stub
  db.test.ts        ← passing
  sanitize.test.ts  ← passing
  ytdlp.test.ts     ← passing
  jobs.test.ts      ← passing
  api.test.ts       ← tests written, all failing
tests/
  fixtures/
    yt-dlp
public/
  .gitkeep
PLANNING/
  DESIGN_DOC.md
  phase-0.md  ...  phase-4.md  ...
```

## Goal of This Phase

Implement `src/server.ts` fully. All tests in `src/api.test.ts` must pass at the end.

---

## `createApp` Signature

```typescript
import type { Database } from "bun:sqlite";
import type { JobQueue } from "./jobs";

export function createApp(
  db: Database,
  queue: JobQueue,
  opts?: { mediaDir?: string }
)
```

Returns a Hono app instance. The `mediaDir` option tells the server where MP3 files live (for the DELETE handler and the `/media/` route). Default to `"./media"` if not provided.

The return type can be inferred — just return the Hono `app` object directly.

---

## Hono Setup

```typescript
import { Hono } from "hono";

export function createApp(db, queue, opts = {}) {
  const mediaDir = opts.mediaDir ?? "./media";
  const app = new Hono();

  // ... routes ...

  return app;
}
```

Tests call `app.request(path, init)` directly (Hono's built-in test helper) — no actual HTTP server is started.

---

## Routes

### `POST /api/jobs`

**Request body:** `{ url: string; title?: string }`

**Validation:**
1. Parse body as JSON. If malformed or `url` is missing → 400.
2. `isAllowedUrl(url)` → if false, 400 with `{ error: "URL not allowed" }`.
3. `isPlaylistUrl(url)` → if true, 400 with `{ error: "Playlist URLs are not supported" }`.

**On success:**
1. `insertJob(db, { source_url: url, requested_title: title ?? null })`
2. `queue.enqueue(job.id)`
3. Return 201 with `{ jobId: job.id }`

---

### `GET /api/jobs/:id`

1. `getJob(db, id)` → if null, 404.
2. Build response:

```json
{
  "id": "...",
  "status": "queued|running|finished|failed",
  "progress": "...",
  "error": null,
  "track": null
}
```

3. If `job.status === "finished"` and `job.track_id`:
   - `getTrack(db, job.track_id)` → if found, populate `track`:
   ```json
   {
     "id": "...",
     "title": "...",
     "url": "/media/<filename>"
   }
   ```

Return 200.

---

### `GET /api/tracks`

1. `getAllTracks(db)`
2. Map each track to:
```json
{
  "id": "...",
  "title": "...",
  "url": "/media/<filename>",
  "createdAt": 123456789
}
```
3. Return 200 with the array.

---

### `DELETE /api/tracks/:id`

1. `getTrack(db, id)` → if null, 404.
2. Delete the file: `join(mediaDir, track.filename)`.
   - Use `unlinkSync` from `"fs"`. If the file doesn't exist, swallow the error (it's already gone).
3. `deleteTrack(db, id)`.
4. Return 204 (no body).

---

### `GET /media/:filename`

Serve the raw MP3 file from `mediaDir`.

```typescript
app.get("/media/:filename", async (c) => {
  const filename = c.req.param("filename");

  // Security: reject path traversal attempts
  if (filename.includes("..") || filename.includes("/")) {
    return c.text("Forbidden", 403);
  }

  const filePath = join(mediaDir, filename);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return c.text("Not found", 404);
  }

  return new Response(file, {
    headers: { "Content-Type": "audio/mpeg" },
  });
});
```

---

### `GET /*` — Static Frontend

Serve files from `./public`. Use Hono's `serveStatic`:

```typescript
import { serveStatic } from "hono/bun";

app.get("/*", serveStatic({ root: "./public" }));
```

This serves `index.html` for `/`, `app.js` for `/app.js`, etc.

---

## Rate Limiting (Simple)

Add a simple in-memory rate limiter on `POST /api/jobs`. Limit each IP to 10 requests per minute.

```typescript
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true; // allowed
  }

  if (entry.count >= 10) return false; // blocked

  entry.count++;
  return true;
}
```

In the route handler:

```typescript
const ip = c.req.header("x-forwarded-for") ?? "unknown";
if (!checkRateLimit(ip)) {
  return c.json({ error: "Rate limit exceeded" }, 429);
}
```

---

## Optional: API Token

If the environment variable `API_TOKEN` is set, require `Authorization: Bearer <token>` on all `/api/*` routes.

```typescript
app.use("/api/*", async (c, next) => {
  const token = process.env.API_TOKEN;
  if (!token) return next();

  const header = c.req.header("authorization") ?? "";
  if (header !== `Bearer ${token}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
});
```

Place this middleware **before** the route handlers so it applies to all API routes.

For tests, `API_TOKEN` will not be set in the environment, so this middleware passes through automatically.

---

## Error Handling

Add a global error handler at the end:

```typescript
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
```

---

## Full Import List

```typescript
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { join } from "path";
import { unlinkSync } from "fs";
import type { Database } from "bun:sqlite";
import { getJob, getTrack, getAllTracks, insertJob, deleteTrack } from "./db";
import { isAllowedUrl, isPlaylistUrl } from "./sanitize";
import type { JobQueue } from "./jobs";
```

---

## Notes

- Hono's `app.request()` is used by tests in-process — it does not start a TCP server. This is the idiomatic way to test Hono apps.
- `serveStatic` from `"hono/bun"` reads from disk relative to the current working directory. It will work at runtime but in tests it may 404 for non-existent public files — that's acceptable, the API tests don't test static file serving.
- The `/media/:filename` route must reject `..` in filenames to prevent path traversal.
- Do not use `c.req.raw` — use `c.req.json()` for body parsing and `c.req.param()` for path params.

---

## Success Criteria

Run `bun test src/api.test.ts` — all tests must pass.

Run `bun test` — all test files must pass.

Commit when done:

```sh
git add src/server.ts
git commit -m "Phase 5: implement HTTP server and API routes"
```
