import { mkdirSync } from "fs";
import { dirname } from "path";
import { openDb, runMigrations } from "./db";
import { createQueue } from "./jobs";
import { createApp } from "./server";

const PORT      = Number(process.env.PORT ?? "47291");
const HOST      = process.env.HOST      ?? "127.0.0.1";
const MEDIA_DIR = process.env.MEDIA_DIR ?? "./media";
const TMP_DIR   = process.env.TMP_DIR   ?? "./tmp";
const DB_PATH   = process.env.DB_PATH   ?? "./data/app.sqlite";

mkdirSync(MEDIA_DIR, { recursive: true });
mkdirSync(TMP_DIR,   { recursive: true });
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = openDb(DB_PATH);
runMigrations(db);

const queue = createQueue(db, {
  mediaDir: MEDIA_DIR,
  tmpDir: TMP_DIR,
});

const app = createApp(db, queue, { mediaDir: MEDIA_DIR });

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
});

console.log(`listening on http://${HOST}:${PORT}`);
