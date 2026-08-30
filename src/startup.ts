import { readdirSync, rmSync } from "fs";
import { join } from "path";

const JOB_ARTIFACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\./i;

export function cleanupOrphanedDownloads(tmpDir: string): number {
  let removed = 0;
  for (const entry of readdirSync(tmpDir, { withFileTypes: true })) {
    if (!JOB_ARTIFACT.test(entry.name)) continue;
    rmSync(join(tmpDir, entry.name), { recursive: entry.isDirectory(), force: true });
    removed++;
  }
  return removed;
}
