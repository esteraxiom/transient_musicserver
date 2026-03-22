import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { join } from "path";
import { unlinkSync } from "fs";
import type { Database } from "bun:sqlite";
import { getJob, getTrack, getAllTracks, insertJob, deleteTrack } from "./db";
import { isAllowedUrl, isPlaylistUrl } from "./sanitize";
import type { JobQueue } from "./jobs";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 10) return false;

  entry.count++;
  return true;
}

export function createApp(db: Database, queue: JobQueue, opts?: { mediaDir?: string }) {
  const mediaDir = opts?.mediaDir ?? "./media";
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    const token = process.env.API_TOKEN;
    if (!token) return next();

    const header = c.req.header("authorization") ?? "";
    if (header !== `Bearer ${token}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return next();
  });

  app.post("/api/jobs", async (c) => {
    const ip = c.req.header("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(ip)) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    let body: { url?: string; title?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const { url, title } = body;
    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }

    if (!isAllowedUrl(url)) {
      return c.json({ error: "URL not allowed" }, 400);
    }

    if (isPlaylistUrl(url)) {
      return c.json({ error: "Playlist URLs are not supported" }, 400);
    }

    const job = insertJob(db, { source_url: url, requested_title: title ?? null });
    queue.enqueue(job.id);

    return c.json({ jobId: job.id }, 201);
  });

  app.get("/api/jobs/:id", (c) => {
    const id = c.req.param("id");
    const job = getJob(db, id);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    const response: Record<string, unknown> = {
      id: job.id,
      status: job.status,
      progress: job.progress,
      error: job.error,
      track: null,
    };

    if (job.status === "finished" && job.track_id) {
      const track = getTrack(db, job.track_id);
      if (track) {
        response.track = {
          id: track.id,
          title: track.title,
          url: `/media/${track.filename}`,
        };
      }
    }

    return c.json(response, 200);
  });

  app.get("/api/tracks", (c) => {
    const tracks = getAllTracks(db);
    const response = tracks.map((track) => ({
      id: track.id,
      title: track.title,
      url: `/media/${track.filename}`,
      createdAt: track.created_at,
    }));
    return c.json(response, 200);
  });

  app.delete("/api/tracks/:id", (c) => {
    const id = c.req.param("id");
    const track = getTrack(db, id);

    if (!track) {
      return c.json({ error: "Track not found" }, 404);
    }

    try {
      unlinkSync(join(mediaDir, track.filename));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }

    deleteTrack(db, id);
    return new Response(null, { status: 204 });
  });

  app.get("/media/:filename", async (c) => {
    const filename = c.req.param("filename");

    if (filename.includes("..") || filename.includes("/")) {
      return c.text("Forbidden", 403);
    }

    const filePath = join(mediaDir, filename);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return c.text("Not found", 404);
    }

    return new Response(file, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  });

  app.get("/*", serveStatic({ root: "./public" }));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
