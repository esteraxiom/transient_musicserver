# transient-musicserver

Self-hosted LAN service to download YouTube audio as MP3 and serve it for streaming.

## Requirements

- [Bun](https://bun.sh/) runtime
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) in PATH
- [ffmpeg](https://ffmpeg.org/) in PATH

## Quick Start

```sh
bun install
bun start
```

Open http://localhost:47291 in your browser.

## Configuration

Environment variables (all optional with defaults):

| Variable    | Default            | Description                      |
|-------------|--------------------|----------------------------------|
| `PORT`      | `47291`            | TCP port to listen on            |
| `HOST`      | `127.0.0.1`        | Bind address                     |
| `MEDIA_DIR` | `./media`          | Directory for finished MP3s      |
| `TMP_DIR`   | `./tmp`            | Directory for in-progress files  |
| `DB_PATH`   | `./data/app.sqlite`| SQLite database file path        |
| `API_TOKEN` | *(unset)*          | Optional bearer token for /api/* |

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
    "createdAt": 123456789
  }
]
```

### DELETE /api/tracks/:id

Delete a track and its file. Returns 204 on success.

### GET /media/:filename

Stream an MP3 file.

## Web UI

The web interface at `/` provides:

- URL input for YouTube links
- Optional custom title
- Real-time progress display
- Track list with play/copy links

## Security Notes

- Only YouTube domains are allowed
- Playlist URLs are rejected
- Rate limiting on job creation (10/minute per IP)
- Optional API token via `API_TOKEN` env var
- Path traversal attempts are blocked

## Tailscale

To expose the server on your tailnet, run this after starting the app:

```sh
tailscale serve 47291
```

Tailscale will provision a TLS certificate and make the server available at:

```
https://<your-device-name>.<tailnet-name>.ts.net
```

To run persistently in the background:

```sh
tailscale serve --bg 47291
```

To stop serving:

```sh
tailscale serve --bg --set-bool false
```

> Requires Tailscale v1.56+ with HTTPS certificates enabled in your tailnet admin console.

## Testing

```sh
bun test
```

## Directory Structure

```
media/       # Finished MP3 files (served publicly)
tmp/         # In-progress downloads (never served)
data/        # SQLite database
public/      # Static web UI files
src/         # Server source code
```
