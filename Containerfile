FROM oven/bun:1.3.11-slim@sha256:478281fdd196871c7e51ba6a820b7803a8ae97042ec86cdbc2e1c6b6626442d9

ARG YT_DLP_VERSION=2026.8.19

LABEL org.opencontainers.image.source="https://github.com/esteraxiom/transient_musicserver"

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-ytdlp.txt /tmp/requirements-ytdlp.txt
RUN grep -qx "yt-dlp==${YT_DLP_VERSION}" /tmp/requirements-ytdlp.txt \
    && python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir --requirement /tmp/requirements-ytdlp.txt \
    && /opt/yt-dlp/bin/yt-dlp --version \
    && rm /tmp/requirements-ytdlp.txt

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY public ./public
COPY src ./src

ENV HOST=0.0.0.0 \
    PORT=47291 \
    MEDIA_DIR=/data/musicserver/media \
    TMP_DIR=/data/musicserver/tmp \
    DB_PATH=/data/musicserver/db/app.sqlite \
    MEDIA_MAX_BYTES=10737418240 \
    MIN_FREE_BYTES=5368709120 \
    HOME=/tmp \
    PATH=/opt/yt-dlp/bin:${PATH}

USER bun
EXPOSE 47291

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:47291/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

CMD ["bun", "run", "src/index.ts"]
