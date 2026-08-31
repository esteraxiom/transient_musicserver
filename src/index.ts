import { mkdirSync } from "fs";
import { dirname } from "path";
import { openDb, recoverInterruptedJobs, runMigrations } from "./db";
import { createQueue } from "./jobs";
import { createApp } from "./server";
import { DEFAULT_MEDIA_MAX_BYTES, DEFAULT_MIN_FREE_BYTES } from "./storage";
import { cleanupOrphanedDownloads, cleanupOrphanedMediaStaging } from "./startup";

const PORT      = Number(process.env.PORT ?? "47291");
const HOST      = process.env.HOST      ?? "192.168.192.83";
const MEDIA_DIR = process.env.MEDIA_DIR ?? "./media";
const TMP_DIR   = process.env.TMP_DIR   ?? "./tmp";
const DB_PATH   = process.env.DB_PATH   ?? "./data/app.sqlite";
const MEDIA_MAX_BYTES = Number(process.env.MEDIA_MAX_BYTES ?? DEFAULT_MEDIA_MAX_BYTES);
const MIN_FREE_BYTES = Number(process.env.MIN_FREE_BYTES ?? DEFAULT_MIN_FREE_BYTES);
const YT_DLP_COOKIES_PATH = process.env.YT_DLP_COOKIES_PATH || undefined;
const YT_DLP_PROXY = process.env.YT_DLP_PROXY || undefined;

mkdirSync(MEDIA_DIR, { recursive: true });
mkdirSync(TMP_DIR,   { recursive: true });
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = openDb(DB_PATH);
runMigrations(db);

cleanupOrphanedDownloads(TMP_DIR);
cleanupOrphanedMediaStaging(MEDIA_DIR);
const recoveredJobIds = recoverInterruptedJobs(db);

const queue = createQueue(db, {
  mediaDir: MEDIA_DIR,
  tmpDir: TMP_DIR,
  maxBytes: MEDIA_MAX_BYTES,
  minFreeBytes: MIN_FREE_BYTES,
  ytdlpCookiesPath: YT_DLP_COOKIES_PATH,
  ytdlpProxy: YT_DLP_PROXY,
});

for (const jobId of recoveredJobIds) queue.enqueue(jobId);

const app = createApp(db, queue, {
  mediaDir: MEDIA_DIR,
  tmpDir: TMP_DIR,
  maxBytes: MEDIA_MAX_BYTES,
  minFreeBytes: MIN_FREE_BYTES,
});

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

console.log(`listening on http://${HOST}:${PORT}`);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}; shutting down`);
  server.stop(false);
  await queue.stop();
  db.close();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
