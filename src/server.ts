import type { Database } from "bun:sqlite";
import type { JobQueue } from "./jobs";

export function createApp(db: Database, queue: JobQueue, opts?: { mediaDir?: string }) {
  throw new Error("not implemented");
}
