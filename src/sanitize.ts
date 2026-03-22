const FORBIDDEN = /[\/\\:*?"<>|]/g;
const CONTROL   = /[\x00-\x1F]/g;
const MULTI_WS  = /\s+/g;

export function sanitizeFilename(name: string): string {
  let s = name
    .replace(FORBIDDEN, "")
    .replace(CONTROL, "")
    .replace(MULTI_WS, " ")
    .trim()
    .slice(0, 120);

  return s || "track";
}

export function generateFilename(title: string, jobId: string): string {
  const safe = sanitizeFilename(title);
  const shortId = jobId.slice(0, 8);
  return `${safe}__${shortId}.mp3`;
}

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has("list");
  } catch {
    return false;
  }
}
