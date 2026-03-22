# LAN YouTube → MP3 Drop Server  
**Bun + TypeScript + SQLite + yt-dlp**

A small self-hosted LAN service with a web UI:

- Paste a YouTube URL (any single video URL)
- Optionally set a custom track name
- Server downloads audio via `yt-dlp` + `ffmpeg`, outputs an `.mp3`
- Stores metadata in SQLite
- Serves MP3s as static files for streaming on the local network
- Provides progress/status feedback per job

Constraints:
- ✅ Progress feedback required
- ✅ Any single YouTube URL
- ✅ SQLite database
- ❌ No playlists
- ❌ No Range support required
- ❌ No advanced streaming logic (just plain MP3 hosting)

---

# 1. Tech Stack

- **Runtime:** Bun
- **Language:** TypeScript
- **HTTP layer:** Hono (recommended) or plain Bun router
- **Database:** SQLite (via `bun:sqlite`)
- **Downloader:** `yt-dlp` (must be in PATH)
- **Transcoder:** `ffmpeg` (must be in PATH)
- **UI:** Static HTML + JS served from `/public`
- **Progress:** Polling (`GET /api/jobs/:id`)

---

# 2. Folder Structure

```
ytmp3-lan/
  public/
    index.html
    app.js
    styles.css
  media/              # Final MP3 storage (publicly served)
  tmp/                # Temporary job output (never served)
  data/
    app.sqlite
  src/
    server.ts
    db.ts
    jobs.ts
    ytdlp.ts
    sanitize.ts
    types.ts
  package.json
  bunfig.toml
  README.md
```

Notes:

- `media/` is the only directory exposed for streaming.
- `tmp/` is strictly internal.
- `data/app.sqlite` stores jobs + tracks.

---

# 3. Database Schema

## tracks

Stores finished downloadable/streamable files.

| Column            | Type    | Notes |
|------------------|---------|-------|
| id               | TEXT PK | UUID |
| title            | TEXT    | Display title |
| filename         | TEXT    | Unique `.mp3` filename |
| source_url       | TEXT    | Original YouTube URL |
| created_at       | INTEGER | Unix ms |
| bytes            | INTEGER | File size |
| duration_seconds | INTEGER | Optional |

Indexes:
- `UNIQUE(filename)`
- `INDEX(created_at)`

---

## jobs

Tracks progress and lifecycle of downloads.

| Column         | Type    | Notes |
|---------------|---------|-------|
| id            | TEXT PK | UUID |
| source_url    | TEXT    | |
| requested_title | TEXT | Optional custom name |
| status        | TEXT    | queued \| running \| finished \| failed |
| progress      | TEXT    | Last progress line |
| track_id      | TEXT    | Nullable FK to tracks |
| error         | TEXT    | Nullable |
| created_at    | INTEGER | Unix ms |
| started_at    | INTEGER | Nullable |
| finished_at   | INTEGER | Nullable |

Indexes:
- `INDEX(status)`

---

# 4. HTTP API

All JSON unless otherwise noted.

---

## POST /api/jobs

Create a new download job.

### Body

```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "title": "optional custom title"
}
```

### Behavior

- Validate URL is allowed YouTube domain
- Reject playlist URLs
- Insert job with `status = queued`
- Enqueue job in memory
- Return immediately

### Response

```json
{ "jobId": "uuid" }
```

---

## GET /api/jobs/:id

Returns job status + optional track info.

### Response

```json
{
  "id": "...",
  "status": "queued|running|finished|failed",
  "progress": "Downloading 43.2% ...",
  "error": null,
  "track": {
    "id": "...",
    "title": "...",
    "url": "/media/file.mp3"
  }
}
```

---

## GET /api/tracks

Returns all finished tracks.

### Response

```json
[
  {
    "id": "...",
    "title": "...",
    "url": "/media/file.mp3",
    "createdAt": 123456789
  }
]
```

---

## DELETE /api/tracks/:id (Optional)

- Deletes DB row
- Deletes file from `media/`
- Returns 204

---

## Static Hosting

`GET /media/:filename`

Serves raw `.mp3` files from disk.

No Range handling required.

Example stream URL:

```
http://192.168.1.50:3000/media/my-song__a1b2c3.mp3
```

---

# 5. Job System Design

## Queue Model

- In-memory FIFO queue
- Single worker (concurrency = 1)
- Prevents CPU spikes and race conditions

Flow:

1. Insert job row (`queued`)
2. Push job ID into queue
3. Worker loop:
   - Set `running`
   - Spawn `yt-dlp`
   - Update progress in DB
   - On success:
     - Move file from `tmp/` → `media/`
     - Insert track
     - Mark job `finished`
   - On failure:
     - Mark job `failed`
     - Store error

---

# 6. yt-dlp Execution

Spawn process using Bun’s subprocess API.

Required flags:

- `--extract-audio`
- `--audio-format mp3`
- `--no-playlist`
- `--newline`
- `-o tmp/<jobId>.%(ext)s`

Progress handling:

- Parse stderr line-by-line
- Extract lines containing `%`
- Update `jobs.progress`
- Throttle DB writes (e.g., max 4/sec)

On completion:

1. Determine final title:
   - If user provided one → use it
   - Otherwise fetch from yt-dlp metadata (`--print "%(title)s"`)

2. Sanitize title

3. Generate filename:
   ```
   safeTitle + "__" + shortId(jobId) + ".mp3"
   ```

4. Move file into `media/`

5. Insert into `tracks`

---

# 7. Filename Sanitization

Rules:

- Remove `/ \ : * ? " < > |`
- Remove control characters
- Collapse whitespace
- Trim
- Limit to 120 chars
- Fallback to `"track"` if empty

Never use raw user input as a path.

---

# 8. Security Guardrails (LAN-safe baseline)

Minimum protections:

- Only allow:
  - youtube.com
  - www.youtube.com
  - m.youtube.com
  - music.youtube.com
  - youtu.be
- Reject URLs containing `list=`
- Rate limit job creation per IP (simple in-memory map)
- Optional API token for `/api/*`
- Never expose `tmp/`
- No direct filesystem writes outside `media/`

---

# 9. UI Design

Single-page interface.

## Components

- URL input
- Optional title input
- Download button
- Job status display
- Tracks list

---

## Flow

1. User submits form
2. POST `/api/jobs`
3. Poll `/api/jobs/:id` every ~1s
4. Display:
   - `queued`
   - `running`
   - progress text
   - `finished` → show link
   - `failed` → show error
5. Refresh tracks list after success

Tracks list:

- Title
- Direct MP3 link
- Copy URL button (Clipboard API)

---

# 10. Environment Variables

```
PORT=3000
HOST=0.0.0.0
MEDIA_DIR=./media
TMP_DIR=./tmp
DB_PATH=./data/app.sqlite
API_TOKEN=optional-secret
```

---

# 11. Startup Sequence

1. Ensure directories exist:
   - `media/`
   - `tmp/`
   - `data/`
2. Open SQLite
3. Run migrations (`CREATE TABLE IF NOT EXISTS`)
4. Start job worker
5. Start HTTP server

---

# 12. Testing Checklist

- [ ] Valid YouTube URL downloads correctly
- [ ] Playlist URLs rejected
- [ ] Custom title produces safe filename
- [ ] Default title works when none provided
- [ ] MP3 accessible at `/media/...`
- [ ] Progress updates visible in UI
- [ ] Failed downloads show error
- [ ] Restart server → tracks persist
- [ ] Path traversal attempts fail safely

---

# 13. Optional Enhancements (Future)

- Thumbnail preview in UI
- Embed metadata tags in MP3
- SSE endpoint instead of polling
- Delete job history
- Basic authentication screen
- Display file size + duration

---

# 14. Non-Goals

- Playlist downloading
- Range/seek optimization
- Multi-user accounts
- Public internet exposure
- Advanced library management

---

# 15. Summary

This architecture provides:

- Clean separation of jobs and tracks
- Safe filesystem usage
- SQLite-backed persistence
- Real-time progress feedback
- Simple LAN streaming via static MP3 URLs
- Minimal moving parts
- Fully Bun-native runtime

It is intentionally small, robust, and expandable.
