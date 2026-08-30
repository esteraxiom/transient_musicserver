import { Hono, type Context } from "hono";
import { serveStatic } from "hono/bun";
import { bodyLimit } from "hono/body-limit";
import { basename, join } from "path";
import { accessSync, constants, unlinkSync } from "fs";
import type { Database } from "bun:sqlite";
import { getJob, getTrack, getAllTracks, insertJob, deleteTrack, filenameExists } from "./db";
import { isAllowedUrl, isPlaylistUrl, generateCustomFilename } from "./sanitize";
import type { JobQueue } from "./jobs";
import { parseByteRange } from "./media";
import { DEFAULT_MEDIA_MAX_BYTES, DEFAULT_MIN_FREE_BYTES, getStorageStatus } from "./storage";

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function getForwardedClientIp(header: string | undefined): string {
  return header?.split(",").at(-1)?.trim() || "unknown";
}

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

export function createApp(db: Database, queue: JobQueue, opts?: {
  mediaDir?: string;
  tmpDir?: string;
  maxBytes?: number;
  minFreeBytes?: number;
}) {
  const mediaDir = opts?.mediaDir ?? "./media";
  const tmpDir = opts?.tmpDir ?? mediaDir;
  const maxBytes = opts?.maxBytes ?? DEFAULT_MEDIA_MAX_BYTES;
  const minFreeBytes = opts?.minFreeBytes ?? DEFAULT_MIN_FREE_BYTES;
  const app = new Hono();

  app.get("/health", (c) => {
    try {
      db.query<{ ok: number }, []>("SELECT 1 AS ok").get();
      accessSync(mediaDir, constants.R_OK | constants.W_OK);
      accessSync(tmpDir, constants.R_OK | constants.W_OK);
      return c.json({ status: "ok" }, 200);
    } catch {
      return c.json({ status: "unhealthy" }, 503);
    }
  });

  app.use("/api/*", async (c, next) => {
    const token = process.env.API_TOKEN;
    if (!token) return next();

    const header = c.req.header("authorization") ?? "";
    if (header !== `Bearer ${token}`) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return next();
  });

  app.use("/api/jobs", bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => c.json({ error: "Request body too large" }, 413),
  }));

  app.post("/api/jobs", async (c) => {
    const ip = getForwardedClientIp(c.req.header("x-forwarded-for"));
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

    const storage = getStorageStatus({ mediaDir, maxBytes, minFreeBytes });
    if (!storage.acceptingJobs) {
      return c.json({ error: storage.reason }, 507);
    }

    if (title && title.trim()) {
      const filename = generateCustomFilename(title);
      if (filenameExists(db, filename)) {
        return c.json({ error: "A track with this name already exists" }, 409);
      }
    }

    const job = insertJob(db, { source_url: url, requested_title: title ?? null, custom_filename: !!title?.trim() });
    queue.enqueue(job.id);

    return c.json({ jobId: job.id }, 201);
  });

  app.get("/api/status", (c) => {
    const storage = getStorageStatus({ mediaDir, maxBytes, minFreeBytes });
    return c.json(storage, 200);
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
      bytes: track.bytes,
    }));
    return c.json(response, 200);
  });

  app.delete("/api/tracks/:id", (c) => {
    const id = c.req.param("id");
    const track = getTrack(db, id);

    if (!track) {
      return c.json({ error: "Track not found" }, 404);
    }

    if (basename(track.filename) !== track.filename || track.filename.includes("..")) {
      return c.json({ error: "Invalid track record" }, 500);
    }

    try {
      unlinkSync(join(mediaDir, track.filename));
    } catch (err) {
      if ((err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }

    deleteTrack(db, id);
    return new Response(null, { status: 204 });
  });

  async function serveMedia(c: Context, headOnly: boolean): Promise<Response> {
    const filename = c.req.param("filename");

    if (!filename || filename.includes("..") || filename.includes("/") || basename(filename) !== filename) {
      return c.text("Forbidden", 403);
    }

    const filePath = join(mediaDir, filename);
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return c.text("Not found", 404);
    }

    const commonHeaders: Record<string, string> = {
      "Accept-Ranges": "bytes",
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    };
    const rangeHeader = c.req.header("range");

    if (!rangeHeader) {
      commonHeaders["Content-Length"] = String(file.size);
      return new Response(headOnly ? null : file, { status: 200, headers: commonHeaders });
    }

    const range = parseByteRange(rangeHeader, file.size);
    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: { ...commonHeaders, "Content-Range": `bytes */${file.size}` },
      });
    }

    const length = range.end - range.start + 1;
    return new Response(headOnly ? null : file.slice(range.start, range.end + 1), {
      status: 206,
      headers: {
        ...commonHeaders,
        "Content-Length": String(length),
        "Content-Range": `bytes ${range.start}-${range.end}/${file.size}`,
      },
    });
  }

  app.get("/media/:filename", (c) => serveMedia(c, false));
  app.on("HEAD", "/media/:filename", (c) => serveMedia(c, true));

  app.get("/*", serveStatic({ root: "./public" }));

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  return app;
}
