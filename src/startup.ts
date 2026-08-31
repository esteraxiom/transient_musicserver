import { readdirSync, rmSync } from "fs";
import { join } from "path";

const JOB_ARTIFACT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\./i;
const MEDIA_STAGING = /^\.musicserver-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.partial$/i;

export function cleanupOrphanedDownloads(tmpDir: string): number {
  let removed = 0;
  for (const entry of readdirSync(tmpDir, { withFileTypes: true })) {
    if (!JOB_ARTIFACT.test(entry.name)) continue;
    rmSync(join(tmpDir, entry.name), { recursive: entry.isDirectory(), force: true });
    removed++;
  }
  return removed;
}

export function cleanupOrphanedMediaStaging(mediaDir: string): number {
  let removed = 0;
  for (const entry of readdirSync(mediaDir, { withFileTypes: true })) {
    if (!entry.isFile() || !MEDIA_STAGING.test(entry.name)) continue;
    rmSync(join(mediaDir, entry.name), { force: true });
    removed++;
  }
  return removed;
}
