# Clariframe yt-dlp proxy

This small Tinyproxy container gives Axiom-One a residential egress path for yt-dlp.
It binds only to Clariframe's Tailscale address, `100.99.92.103:8888`, and its own ACL
accepts only Axiom-One, `100.125.177.38`.

Start or update it from Clariframe:

```bash
docker compose -f deploy/clariframe-proxy/compose.yaml up -d --build
docker compose -f deploy/clariframe-proxy/compose.yaml ps
```

Inspect recent warnings:

```bash
docker logs --tail=100 transient-musicserver-clariframe-proxy
```

The container uses host networking because Docker must bind the listener to Clariframe's
Tailscale address. It runs as UID/GID 65534 with a read-only root filesystem, no Linux
capabilities, and no-new-privileges. `restart: unless-stopped` starts it with Docker after
a reboot, without requiring an interactive user login.

If Clariframe's Tailscale IP changes, update `tinyproxy.conf` and Axiom-One's
`YT_DLP_PROXY` value together.
