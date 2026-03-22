import { Database } from "bun:sqlite";
import type { Job, JobStatus, Track } from "./types";

export function openDb(path: string): Database {
  return new Database(path);
}

export function runMigrations(db: Database): void {
  db.run(`
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
      finished_at      INTEGER,
      custom_filename  INTEGER DEFAULT 0
    )
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status)`);

  db.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      filename         TEXT NOT NULL,
      source_url       TEXT NOT NULL,
      created_at       INTEGER NOT NULL,
      bytes            INTEGER NOT NULL,
      duration_seconds INTEGER
    )
  `);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_filename ON tracks (filename)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks (created_at)`);
}

export function filenameExists(db: Database, filename: string): boolean {
  const result = db.query<{ count: number }, [string]>(
    `SELECT COUNT(*) as count FROM tracks WHERE filename = ?`
  ).get(filename);
  return result !== null && result.count > 0;
}

export function insertJob(
  db: Database,
  fields: { source_url: string; requested_title: string | null; custom_filename?: boolean }
): Job {
  const id = crypto.randomUUID();
  const created_at = Date.now();
  const custom_filename = fields.custom_filename ? 1 : 0;
  db.run(
    `INSERT INTO jobs (id, source_url, requested_title, status, created_at, custom_filename)
     VALUES (?, ?, ?, 'queued', ?, ?)`,
    [id, fields.source_url, fields.requested_title, created_at, custom_filename]
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
    custom_filename: fields.custom_filename ?? false,
  };
}

export function getJob(db: Database, id: string): Job | null {
  return db.query<Job, [string]>(
    `SELECT * FROM jobs WHERE id = ?`
  ).get(id) ?? null;
}

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

export function updateJobProgress(db: Database, id: string, progress: string): void {
  db.run(`UPDATE jobs SET progress = ? WHERE id = ?`, [progress, id]);
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
  const id = crypto.randomUUID();
  const created_at = Date.now();
  db.run(
    `INSERT INTO tracks (id, title, filename, source_url, created_at, bytes, duration_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, fields.title, fields.filename, fields.source_url, created_at, fields.bytes, fields.duration_seconds]
  );
  return {
    id,
    title: fields.title,
    filename: fields.filename,
    source_url: fields.source_url,
    created_at,
    bytes: fields.bytes,
    duration_seconds: fields.duration_seconds,
  };
}

export function getTrack(db: Database, id: string): Track | null {
  return db.query<Track, [string]>(
    `SELECT * FROM tracks WHERE id = ?`
  ).get(id) ?? null;
}

export function getAllTracks(db: Database): Track[] {
  return db.query<Track, []>(`SELECT * FROM tracks ORDER BY created_at DESC`).all();
}

export function deleteTrack(db: Database, id: string): boolean {
  const result = db.run(`DELETE FROM tracks WHERE id = ?`, [id]);
  return result.changes > 0;
}
