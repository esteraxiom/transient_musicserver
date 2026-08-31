import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { cleanupOrphanedDownloads, cleanupOrphanedMediaStaging } from "./startup";

describe("cleanupOrphanedDownloads", () => {
  test("removes only UUID-prefixed job artifacts", () => {
    const directory = mkdtempSync(join(tmpdir(), "startup-test-"));
    const jobArtifact = join(directory, "a929494d-9f43-4f63-9e2b-4f0c3cb9f2b8.mp3.part");
    const unrelated = join(directory, "keep-me.txt");
    writeFileSync(jobArtifact, "partial");
    writeFileSync(unrelated, "important");

    expect(cleanupOrphanedDownloads(directory)).toBe(1);
    expect(existsSync(jobArtifact)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);

    rmSync(directory, { recursive: true, force: true });
  });
});

describe("cleanupOrphanedMediaStaging", () => {
  test("removes only app-owned media staging files", () => {
    const directory = mkdtempSync(join(tmpdir(), "media-startup-test-"));
    const staging = join(directory, ".musicserver-a929494d-9f43-4f63-9e2b-4f0c3cb9f2b8.partial");
    const unrelated = join(directory, ".keep-me.partial");
    writeFileSync(staging, "partial");
    writeFileSync(unrelated, "important");

    expect(cleanupOrphanedMediaStaging(directory)).toBe(1);
    expect(existsSync(staging)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);

    rmSync(directory, { recursive: true, force: true });
  });
});
