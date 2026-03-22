import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { openDb, runMigrations, insertTrack } from "./db";
import { createApp } from "./server";
import { createQueue } from "./jobs";
import type { Database } from "bun:sqlite";
import type { DownloadOptions } from "./ytdlp";
import { join } from "path";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

let db: Database;
let app: ReturnType<typeof createApp>;
let tmpDir: string;
let queue: ReturnType<typeof createQueue>;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
  tmpDir = mkdtempSync(join(tmpdir(), "api-test-"));

  queue = createQueue(db, {
    mediaDir: tmpDir,
    tmpDir,
    ytdlpRunner: async (opts: DownloadOptions) => {
      const outputPath = opts.outputTemplate.replace("%(ext)s", "mp3");
      await Bun.write(outputPath, new Uint8Array([0xff, 0xfb]));
    },
    titleFetcher: async () => "Test Title",
  });

  app = createApp(db, queue, { mediaDir: tmpDir });
});

afterEach(() => {
  queue?.stop();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("POST /api/jobs", () => {
  test("returns 201 and jobId for a valid YouTube URL", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { jobId: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId.length).toBeGreaterThan(0);
  });

  test("returns 201 with optional custom title", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc123", title: "My Custom Name" }),
    });
    expect(res.status).toBe(201);
  });

  test("returns 400 for non-YouTube URL", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://vimeo.com/video/123" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 for playlist URL", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc&list=PLxxxxx" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 when url field is missing", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "No URL provided" }),
    });
    expect(res.status).toBe(400);
  });

  test("returns 400 for empty body", async () => {
    const res = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs/:id", () => {
  test("returns job status for a known job", async () => {
    const postRes = await app.request("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://www.youtube.com/watch?v=abc123" }),
    });
    const { jobId } = await postRes.json() as { jobId: string };

    const res = await app.request(`/api/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { id: string; status: string };
    expect(body.id).toBe(jobId);
    expect(["queued", "running", "finished", "failed"]).toContain(body.status);
  });

  test("returns 404 for nonexistent job id", async () => {
    const res = await app.request("/api/jobs/definitely-not-a-real-id");
    expect(res.status).toBe(404);
  });

  test("includes track info when job is finished", async () => {
    // Seed a finished job with a linked track
    const track = insertTrack(db, {
      title: "My Track",
      filename: "my_track__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });

    const { insertJob, updateJobStatus } = await import("./db");
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    updateJobStatus(db, job.id, "finished", { track_id: track.id, finished_at: Date.now() });

    const res = await app.request(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; track: { title: string; url: string } };
    expect(body.status).toBe("finished");
    expect(body.track).toBeDefined();
    expect(body.track.title).toBe("My Track");
    expect(body.track.url).toMatch(/\/media\/my_track__abc\.mp3$/);
  });
});

describe("GET /api/tracks", () => {
  test("returns empty array when no tracks exist", async () => {
    const res = await app.request("/api/tracks");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  test("returns tracks with expected shape", async () => {
    await Bun.write(join(tmpDir, "song__abc12345.mp3"), new Uint8Array([0xff]));
    insertTrack(db, {
      title: "My Song",
      filename: "song__abc12345.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });

    const res = await app.request("/api/tracks");
    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ id: string; title: string; url: string; createdAt: number }>;
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("My Song");
    expect(body[0].url).toMatch(/\/media\/song__abc12345\.mp3$/);
    expect(typeof body[0].createdAt).toBe("number");
  });
});

describe("DELETE /api/tracks/:id", () => {
  test("returns 204 and removes the track", async () => {
    await Bun.write(join(tmpDir, "song__del.mp3"), new Uint8Array([0xff]));
    const track = insertTrack(db, {
      title: "To Delete",
      filename: "song__del.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 512,
      duration_seconds: null,
    });

    const res = await app.request(`/api/tracks/${track.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    // Verify it's gone from the list
    const listRes = await app.request("/api/tracks");
    const tracks = await listRes.json() as unknown[];
    expect(tracks).toHaveLength(0);
  });

  test("returns 404 for a nonexistent track id", async () => {
    const res = await app.request("/api/tracks/nonexistent-track-id", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
