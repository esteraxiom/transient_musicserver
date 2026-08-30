# Axiom-One deployment specification

- REQ-001: Resolve `m.core` to `100.125.177.38` through the authoritative `core` zone.
- REQ-002: Admit `m.core`, `books.core`, and `komga.core` traffic only from Tailscale IPv4
  and IPv6 source ranges at Traefik.
- REQ-003: Run the application as a non-root UID with no published host ports, no Linux
  capabilities, a read-only root filesystem, and persistent `/data/musicserver` mounts.
- REQ-004: Keep finished media at or below 10 GiB and reject new work when host free
  space falls below 5 GiB. Never prune tracks automatically.
- REQ-005: Recover queued and interrupted work after restart and remove only app-owned
  temporary job artifacts.
- REQ-006: Support GET and HEAD media responses plus one satisfiable HTTP byte range.
- REQ-007: Expose health and storage status, track byte counts, and permanent manual
  deletion through the API and existing UI.
- REQ-008: Migrate exactly 14 rows and 14 matching files totaling 167,032,590 bytes
  without modifying the local source copy.
- REQ-009: Test and type-check every push and pull request. Publish AMD64 SHA and
  `mistress` images and deploy only after checks pass.
- REQ-010: Preserve persistent data during image rollback and document that no automated
  application backup exists.
