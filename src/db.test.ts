import { test, expect, describe, beforeEach } from "bun:test";
import { openDb, runMigrations, insertJob, getJob, updateJobStatus, updateJobProgress, insertTrack, getTrack, getAllTracks, deleteTrack } from "./db";
import type { Database } from "bun:sqlite";

let db: Database;

beforeEach(() => {
  db = openDb(":memory:");
  runMigrations(db);
});

describe("jobs", () => {
  test("insertJob creates a job with queued status", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    expect(job.id).toBeTruthy();
    expect(job.status).toBe("queued");
    expect(job.source_url).toBe("https://youtube.com/watch?v=test");
    expect(job.requested_title).toBeNull();
    expect(job.created_at).toBeGreaterThan(0);
    expect(job.started_at).toBeNull();
    expect(job.finished_at).toBeNull();
    expect(job.error).toBeNull();
    expect(job.track_id).toBeNull();
  });

  test("insertJob stores requested_title", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: "My Song" });
    expect(job.requested_title).toBe("My Song");
  });

  test("getJob retrieves an existing job", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    const retrieved = getJob(db, job.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(job.id);
  });

  test("getJob returns null for nonexistent id", () => {
    expect(getJob(db, "nonexistent-id")).toBeNull();
  });

  test("updateJobStatus transitions to running with started_at", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    const now = Date.now();
    updateJobStatus(db, job.id, "running", { started_at: now });
    const updated = getJob(db, job.id);
    expect(updated!.status).toBe("running");
    expect(updated!.started_at).toBe(now);
  });

  test("updateJobStatus transitions to finished with track_id", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    const now = Date.now();
    updateJobStatus(db, job.id, "finished", { track_id: "track-uuid-123", finished_at: now });
    const updated = getJob(db, job.id);
    expect(updated!.status).toBe("finished");
    expect(updated!.track_id).toBe("track-uuid-123");
    expect(updated!.finished_at).toBe(now);
  });

  test("updateJobStatus transitions to failed with error", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    updateJobStatus(db, job.id, "failed", { error: "yt-dlp exited with code 1" });
    const updated = getJob(db, job.id);
    expect(updated!.status).toBe("failed");
    expect(updated!.error).toBe("yt-dlp exited with code 1");
  });

  test("updateJobProgress updates progress field", () => {
    const job = insertJob(db, { source_url: "https://youtube.com/watch?v=test", requested_title: null });
    updateJobProgress(db, job.id, "[download]  50.0% of 5.00MiB");
    const updated = getJob(db, job.id);
    expect(updated!.progress).toBe("[download]  50.0% of 5.00MiB");
  });
});

describe("tracks", () => {
  test("insertTrack creates a track with all fields", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: 180,
    });
    expect(track.id).toBeTruthy();
    expect(track.title).toBe("Test Song");
    expect(track.filename).toBe("Test_Song__abc.mp3");
    expect(track.source_url).toBe("https://youtube.com/watch?v=test");
    expect(track.bytes).toBe(1024);
    expect(track.duration_seconds).toBe(180);
    expect(track.created_at).toBeGreaterThan(0);
  });

  test("insertTrack allows null duration_seconds", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 512,
      duration_seconds: null,
    });
    expect(track.duration_seconds).toBeNull();
  });

  test("getTrack retrieves a track by id", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });
    const retrieved = getTrack(db, track.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(track.id);
    expect(retrieved!.title).toBe("Test Song");
  });

  test("getTrack returns null for nonexistent id", () => {
    expect(getTrack(db, "nonexistent")).toBeNull();
  });

  test("getAllTracks returns all inserted tracks", () => {
    insertTrack(db, { title: "A", filename: "a.mp3", source_url: "https://youtube.com/watch?v=a", bytes: 100, duration_seconds: null });
    insertTrack(db, { title: "B", filename: "b.mp3", source_url: "https://youtube.com/watch?v=b", bytes: 100, duration_seconds: null });
    const tracks = getAllTracks(db);
    expect(tracks.length).toBe(2);
    const titles = tracks.map(t => t.title);
    expect(titles).toContain("A");
    expect(titles).toContain("B");
  });

  test("getAllTracks returns empty array when no tracks", () => {
    expect(getAllTracks(db)).toEqual([]);
  });

  test("deleteTrack removes the track and returns true", () => {
    const track = insertTrack(db, {
      title: "Test Song",
      filename: "Test_Song__abc.mp3",
      source_url: "https://youtube.com/watch?v=test",
      bytes: 1024,
      duration_seconds: null,
    });
    expect(deleteTrack(db, track.id)).toBe(true);
    expect(getTrack(db, track.id)).toBeNull();
  });

  test("deleteTrack returns false for nonexistent id", () => {
    expect(deleteTrack(db, "nonexistent")).toBe(false);
  });
});
