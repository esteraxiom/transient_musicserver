# Deployment research

- The local suite started at 63 passing tests. The catalog contains 14 finished jobs and
  14 matching MP3 files totaling 167,032,590 bytes.
- Axiom-One uses Tailscale IP `100.125.177.38`, CoreDNS for `.core`, and Coolify's
  Traefik proxy on the external `coolify` Docker network.
- Axiom-One had about 24 GiB free before deployment. Existing `/data` consumers include
  Calibre-Web and Komga.
- Public-IP requests with forged `Host: books.core` and `Host: komga.core` reached both
  applications. UFW alone does not protect Docker-published proxy ports.
- The repository already uses Bun, Hono, SQLite, yt-dlp, and ffmpeg. The old queue was
  memory-only and did not recover queued or running jobs after restart.
- The accepted release pattern matches the existing OC Panel deployment: GitHub-hosted
  AMD64 builds, SHA and branch tags in GHCR, then an authenticated Coolify webhook.
