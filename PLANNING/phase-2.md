# Phase 2: Sanitization and URL Validation

## Project Overview

`transient-musicserver` — self-hosted LAN service, downloads YouTube audio as MP3 and serves it. Stack: Bun · TypeScript · SQLite (`bun:sqlite`) · Hono · yt-dlp.

Full spec: `PLANNING/DESIGN_DOC.md`

## File Tree at Start of This Phase

```
.git/
.gitignore
package.json
bunfig.toml
src/
  types.ts          ← complete
  db.ts             ← complete (Phase 1 done)
  sanitize.ts       ← STUB (all functions throw "not implemented")
  ytdlp.ts          ← stub
  jobs.ts           ← stub
  server.ts         ← stub
  index.ts          ← stub
  db.test.ts        ← passing
  sanitize.test.ts  ← tests written, all failing
  ytdlp.test.ts     ← failing
  jobs.test.ts      ← failing
  api.test.ts       ← failing
tests/
  fixtures/
    yt-dlp
public/
  .gitkeep
PLANNING/
  DESIGN_DOC.md
  phase-0.md  phase-1.md  ...
```

## Goal of This Phase

Implement `src/sanitize.ts` fully. All tests in `src/sanitize.test.ts` should pass at the end.

---

## Implementation

### `src/sanitize.ts`

This module provides four exported functions.

---

#### `sanitizeFilename(name: string): string`

Produces a safe filename string. Rules applied in order:

1. **Remove forbidden characters:** `/  \  :  *  ?  "  <  >  |`
   Strip them entirely (do not replace with another character).

2. **Remove control characters:** codepoints 0x00–0x1F.

3. **Collapse whitespace:** replace runs of one or more whitespace characters with a single space.

4. **Trim** leading and trailing whitespace.

5. **Limit to 120 characters:** slice at 120 if longer.

6. **Fallback:** if the result is empty after all the above, return `"track"`.

```typescript
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
```

---

#### `generateFilename(title: string, jobId: string): string`

Combines a sanitized title with the first 8 characters of the job ID.

Format: `<sanitizedTitle>__<first8ofJobId>.mp3`

```typescript
export function generateFilename(title: string, jobId: string): string {
  const safe = sanitizeFilename(title);
  const shortId = jobId.slice(0, 8);
  return `${safe}__${shortId}.mp3`;
}
```

---

#### `isAllowedUrl(url: string): boolean`

Returns `true` only if the URL parses successfully and its hostname is on the allowlist.

**Allowed hostnames:**
- `youtube.com`
- `www.youtube.com`
- `m.youtube.com`
- `music.youtube.com`
- `youtu.be`

Return `false` for any parse error (malformed URLs, empty string, etc.).

```typescript
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
```

---

#### `isPlaylistUrl(url: string): boolean`

Returns `true` if the URL contains a `list` query parameter. Returns `false` if the URL doesn't parse, or has no `list` param.

```typescript
export function isPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.has("list");
  } catch {
    return false;
  }
}
```

---

## Notes

- `new URL(url)` throws on malformed input — always wrap in try/catch.
- The forbidden character list comes directly from the design doc, section 7.
- `sanitizeFilename` removes characters entirely — it does not replace them with underscores or dashes.
- `generateFilename` always calls `sanitizeFilename` internally, so callers do not need to pre-sanitize.

---

## Success Criteria

Run `bun test src/sanitize.test.ts` — all tests must pass.

Previously passing `src/db.test.ts` must still pass.

Commit when done:

```sh
git add src/sanitize.ts
git commit -m "Phase 2: implement sanitization and URL validation"
```
