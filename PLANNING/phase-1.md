# Phase 1: Database Layer

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
  types.ts          ← complete (types only, no logic)
  db.ts             ← STUB (all functions throw "not implemented")
  sanitize.ts       ← stub
  ytdlp.ts          ← stub
  jobs.ts           ← stub
  server.ts         ← stub
  index.ts          ← stub
  db.test.ts        ← tests written, all failing
  sanitize.test.ts  ← tests written, all failing
  ytdlp.test.ts     ← tests written, all failing
  jobs.test.ts      ← tests written, all failing
  api.test.ts       ← tests written, all failing
tests/
  fixtures/
    yt-dlp          ← dummy shell script, executable
public/
  .gitkeep
PLANNING/
  DESIGN_DOC.md
  phase-0.md  ...
```

## Goal of This Phase

Implement `src/db.ts` fully. All tests in `src/db.test.ts` should pass at the end.

The other test files will continue to fail — that is expected.

---

## Implementation

### `src/db.ts`

Use `bun:sqlite` — it is built into Bun, no npm package needed.

```typescript
import { Database } from "bun:sqlite";
```

#### `openDb(path: string): Database`

Opens (or creates) a SQLite database file at `path`. Pass `":memory:"` for in-memory use.

```typescript
export function openDb(path: string): Database {
  return new Database(path);
}
```

#### `runMigrations(db: Database): void`

Creates the two tables if they don't already exist. Use `CREATE TABLE IF NOT EXISTS`.

**`jobs` table:**

```sql
CREATE TABLE IF NOT EXISTS jobs (
  id               TEXT PRIMARY KEY,
  source_url       TEXT NOT NULL,
  requested_title  TEXT,
  status           TEXT NOT NULL DEFAULT 'queued',
  progress         TEXT,
  track_id         TEXT,
  error            TEXT,
  created_at       INTEGER NOT NULL,
  started_at       INTEGER,
  finished_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
```

**`tracks` table:**

```sql
CREATE TABLE IF NOT EXISTS tracks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  filename         TEXT NOT NULL,
  source_url       TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  bytes            INTEGER NOT NULL,
  duration_seconds INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_filename ON tracks (filename);
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks (created_at);
```

#### `insertJob`

Generate a UUID with `crypto.randomUUID()`. Set `created_at = Date.now()`. Return the full `Job` object.

```typescript
export function insertJob(
  db: Database,
  fields: { source_url: string; requested_title: string | null }
): Job {
  const id = crypto.randomUUID();
  const created_at = Date.now();
  db.run(
    `INSERT INTO jobs (id, source_url, requested_title, status, created_at)
     VALUES (?, ?, ?, 'queued', ?)`,
    [id, fields.source_url, fields.requested_title, created_at]
  );
  return {
    id,
    source_url: fields.source_url,
    requested_title: fields.requested_title,
    status: 'queued',
    progress: null,
    track_id: null,
    error: null,
    created_at,
    started_at: null,
    finished_at: null,
  };
}
```

#### `getJob`

```typescript
export function getJob(db: Database, id: string): Job | null {
  return db.query<Job, [string]>(
    `SELECT * FROM jobs WHERE id = ?`
  ).get(id) ?? null;
}
```

Note: `bun:sqlite` returns `null` for `.get()` when no row is found. The `?? null` handles the case where it returns `undefined`.

#### `updateJobStatus`

Build the SET clause dynamically from `extra`. The `extra` object can include `track_id`, `error`, `started_at`, `finished_at`.

```typescript
export function updateJobStatus(
  db: Database,
  id: string,
  status: JobStatus,
  extra?: Partial<Pick<Job, 'track_id' | 'error' | 'started_at' | 'finished_at'>>
): void {
  const fields: Record<string, unknown> = { status };
  if (extra) Object.assign(fields, extra);

  const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(", ");
  const values = [...Object.values(fields), id];

  db.run(`UPDATE jobs SET ${setClauses} WHERE id = ?`, values);
}
```

#### `updateJobProgress`

```typescript
export function updateJobProgress(db: Database, id: string, progress: string): void {
  db.run(`UPDATE jobs SET progress = ? WHERE id = ?`, [progress, id]);
}
```

#### `insertTrack`

Same pattern as `insertJob` — generate UUID, set `created_at`, return full object.

#### `getTrack`

```typescript
export function getTrack(db: Database, id: string): Track | null {
  return db.query<Track, [string]>(
    `SELECT * FROM tracks WHERE id = ?`
  ).get(id) ?? null;
}
```

#### `getAllTracks`

Return all tracks, ordered by `created_at DESC`.

```typescript
export function getAllTracks(db: Database): Track[] {
  return db.query<Track, []>(`SELECT * FROM tracks ORDER BY created_at DESC`).all();
}
```

#### `deleteTrack`

```typescript
export function deleteTrack(db: Database, id: string): boolean {
  const result = db.run(`DELETE FROM tracks WHERE id = ?`, [id]);
  return result.changes > 0;
}
```

`db.run()` returns an object with a `changes` property (number of rows affected).

---

## Notes

- `bun:sqlite` uses `db.run()` for INSERT/UPDATE/DELETE and `db.query().get()` / `.all()` for SELECT.
- `db.query<RowType, ParamsType>()` is the typed query API. Use it.
- All UUIDs are generated with the globally available `crypto.randomUUID()` — no import needed.
- Do not use `db.prepare()` — use `db.query()` instead (Bun's preferred API).
- Timestamps are Unix milliseconds (`Date.now()`).

---

## Success Criteria

Run `bun test src/db.test.ts` — all tests must pass.

The other test files (`sanitize.test.ts`, `ytdlp.test.ts`, `jobs.test.ts`, `api.test.ts`) will continue to fail. That is expected.

Commit when done:

```sh
git add src/db.ts
git commit -m "Phase 1: implement database layer"
```
