# Axiom-One deployment brief

Deploy transient-musicserver to Axiom-One at `http://m.core`. Migrate the existing
14-track catalog, keep access tailnet-only, cap the finished library at 10 GiB, preserve
5 GiB of host free space, and automate tested image delivery through GHCR and Coolify.

Success means the migrated library streams with byte-range seeking, interrupted jobs
recover after restart, public Host-header probes cannot reach private apps, and rollback
changes only the image tag.

The approved boundaries are no second login, no automatic pruning, no automated backup,
and privacy remediation limited to `m.core`, `books.core`, and `komga.core`.
