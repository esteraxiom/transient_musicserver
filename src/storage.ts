import { readdirSync, statfsSync, statSync } from "fs";
import { join } from "path";

export const DEFAULT_MEDIA_MAX_BYTES = 10 * 1024 * 1024 * 1024;
export const DEFAULT_MIN_FREE_BYTES = 5 * 1024 * 1024 * 1024;

export interface StorageStatus {
  usedBytes: number;
  limitBytes: number;
  freeBytes: number;
  minFreeBytes: number;
  acceptingJobs: boolean;
  reason: string | null;
}

export function evaluateStorage(input: {
  usedBytes: number;
  limitBytes: number;
  freeBytes: number;
  minFreeBytes: number;
  additionalBytes: number;
}): Pick<StorageStatus, "acceptingJobs" | "reason"> {
  if (input.usedBytes >= input.limitBytes) {
    return { acceptingJobs: false, reason: "Library storage limit reached" };
  }
  if (input.usedBytes + input.additionalBytes > input.limitBytes) {
    return { acceptingJobs: false, reason: "Download would exceed the library storage limit" };
  }
  if (input.freeBytes < input.minFreeBytes) {
    return { acceptingJobs: false, reason: "Host free-space reserve reached" };
  }
  return { acceptingJobs: true, reason: null };
}

export function getDirectoryBytes(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      total += getDirectoryBytes(path);
    } else if (entry.isFile()) {
      total += statSync(path).size;
    }
  }
  return total;
}

export function getStorageStatus(opts: {
  mediaDir: string;
  maxBytes: number;
  minFreeBytes: number;
  additionalBytes?: number;
}): StorageStatus {
  const usedBytes = getDirectoryBytes(opts.mediaDir);
  const filesystem = statfsSync(opts.mediaDir);
  const freeBytes = filesystem.bavail * filesystem.bsize;
  const result = evaluateStorage({
    usedBytes,
    limitBytes: opts.maxBytes,
    freeBytes,
    minFreeBytes: opts.minFreeBytes,
    additionalBytes: opts.additionalBytes ?? 0,
  });

  return {
    usedBytes,
    limitBytes: opts.maxBytes,
    freeBytes,
    minFreeBytes: opts.minFreeBytes,
    ...result,
  };
}
