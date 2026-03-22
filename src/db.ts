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
