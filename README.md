# transient-musicserver

Self-hosted LAN service to download YouTube audio as MP3 and serve it for streaming.

## Pending To-Dos:
- [x] Delete Songs
- [ ] Flush All Songs
- [ ] Rename Files
- [ ] Support Spaces?

## Requirements

- [Bun](https://bun.sh/) runtime
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) in PATH
- [ffmpeg](https://ffmpeg.org/) in PATH

## Quick Start

```sh
bun install
bun start
```

Open http://localhost:47291 in your browser. The Axiom-One deployment is available to
tailnet clients at `http://m.core`.

## Configuration

Environment variables (all optional with defaults):

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `47291` | TCP port to listen on |
| `HOST` | `127.0.0.1` | Bind address |
| `MEDIA_DIR` | `./media` | Directory for finished MP3s |
| `TMP_DIR` | `./tmp` | Directory for in-progress files |
| `DB_PATH` | `./data/app.sqlite` | SQLite database file path |
| `MEDIA_MAX_BYTES` | `10737418240` | Maximum finished-library size, 10 GiB by default |
| `MIN_FREE_BYTES` | `5368709120` | Required filesystem free-space reserve, 5 GiB by default |
| `API_TOKEN` | *(unset)* | Optional bearer token for `/api/*` |

Create a `.env` file in the project root to override defaults:

```
PORT=47291
HOST=0.0.0.0
API_TOKEN=your-secret-here
```

## API

### POST /api/jobs

Create a download job.

```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "title": "optional custom title"
}
```

Response:

```json
{ "jobId": "uuid" }
```

### GET /api/jobs/:id

Check job status.

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

### GET /api/tracks

List all finished tracks.

```json
[
  {
    "id": "...",
    "title": "...",
    "url": "/media/file.mp3",
    "createdAt": 123456789,
    "bytes": 1234567
  }
]
```

### DELETE /api/tracks/:id

Delete a track and its file. Returns 204 on success.

### GET /media/:filename

Stream an MP3 file. Single HTTP byte ranges and HEAD requests are supported so clients
can seek without downloading the whole file.

### GET /api/status

Return the library limit, used bytes, filesystem free bytes, and whether the service is
accepting new jobs. Job creation returns `507` when a storage limit blocks it.

### GET /health

Return `200` when SQLite and the writable data directories are ready, or `503` otherwise.

## Web UI

The web interface at `/` provides:

- URL input for YouTube links
- Optional custom title
- Real-time progress display
- Track list with play, copy, and permanent-delete controls
- Current library usage against the 10 GiB cap

## Security Notes

- Only YouTube domains are allowed
- Playlist URLs are rejected
- yt-dlp downloads the best audio stream only and rejects source files over 1 GiB
- Rate limiting on job creation (10/minute per IP)
- Optional API token via `API_TOKEN` env var
- Path traversal attempts are blocked
- The production reverse proxy accepts `m.core` traffic only from Tailscale address ranges

## Axiom-One deployment

The repository includes a production `Containerfile`, `compose.yaml`, and shared Traefik
middleware definition. Axiom-One uses these persistent host paths:

- `/data/musicserver/db`
- `/data/musicserver/media`
- `/data/musicserver/tmp`

The service publishes no host port. Traefik reaches it through the external `coolify`
Docker network and routes `http://m.core` after applying `tailnet-only@file`.

Axiom-One SNATs Tailscale-to-Docker traffic to the fixed Coolify bridge gateways
(`10.0.1.1` and `fdc8:fb8c:427a::1`) before Traefik sees it, so the shared middleware
accepts those two transport identities as well as the Tailscale IPv4 and IPv6 ranges.
Public traffic retains its original source address and is rejected.

Pushes to `mistress` run type checks and tests, publish AMD64 images as both `mistress`
and the full commit SHA, then call the Coolify deployment webhook. The GitHub
`production` environment must contain `COOLIFY_WEBHOOK` and `COOLIFY_TOKEN`.

To roll back, select a known-good SHA tag in Coolify and redeploy. Do not remove or
replace the three `/data/musicserver` mounts during rollback.

There is no automated application backup. Axiom-One is the source of truth for tracks
added after deployment.

## Testing

```sh
bun run typecheck
bun test
docker compose config
```

## Directory Structure

```
media/       # Finished MP3 files (served through the app)
tmp/         # In-progress downloads (never served)
data/        # SQLite database
public/      # Static web UI files
src/         # Server source code
```
