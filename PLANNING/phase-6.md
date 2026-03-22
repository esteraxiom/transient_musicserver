# Phase 6: Frontend UI

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
  db.ts             ← complete
  sanitize.ts       ← complete
  ytdlp.ts          ← complete
  jobs.ts           ← complete
  server.ts         ← complete (Phase 5 done)
  index.ts          ← stub (entry point not yet wired)
  (all test files passing)
tests/
  fixtures/
    yt-dlp
public/
  .gitkeep          ← placeholder, replace with real files
PLANNING/
  DESIGN_DOC.md
  phase-0.md  ...  phase-5.md  ...
```

## Goal of This Phase

Implement the frontend. Three files:

- `public/index.html`
- `public/app.js`
- `public/styles.css`

No automated tests. Success is verified manually against the checklist at the bottom.

---

## Design Requirements

- **Dark background:** `#0d0d0d` or similar near-black
- **White outlines:** all inputs, buttons, and panels use `1px solid #ffffff` or `border: 1px solid rgba(255,255,255,0.8)` borders — not shadows, not gradients
- **Monospace font:** `font-family: 'Courier New', Courier, monospace` throughout — body, inputs, buttons, everything
- **No rounded corners** — this is a tool, not a product. Square edges.
- **Text color:** `#ffffff` primary, `#aaaaaa` secondary/muted
- **Accent:** a single accent color for active state / progress (e.g. `#00ff99` or `#39ff14` — a terminal green). Use sparingly.

The aesthetic should feel like a terminal utility that happens to run in a browser.

---

## Components

### 1. Download Form

- `<input type="url">` — YouTube URL
- `<input type="text">` — Optional custom track name
- `<button>` — "DOWNLOAD"

On submit: `POST /api/jobs` and start polling.

### 2. Job Status Panel

Shows after form submission. Hidden when idle.

States to display:
- `queued` → `"queued..."` (muted text)
- `running` → progress line from `job.progress` (accent color)
- `finished` → `"done. "` + a link to the MP3 (white, underlined)
- `failed` → `"error: "` + `job.error` (red: `#ff4444`)

### 3. Tracks List

All downloaded tracks, refreshed after each successful download and on page load.

Each track entry:
- Track title
- A direct link to the MP3: `<a href="/media/filename.mp3">▶ play / download</a>`
- A "copy URL" button using `navigator.clipboard.writeText()`

Show tracks in order returned by `GET /api/tracks` (newest first).

---

## `public/index.html`

Single-page, no build step, no framework. Load `styles.css` and `app.js`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>musicserver</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main>
    <h1>musicserver</h1>

    <section id="form-section">
      <form id="download-form">
        <input type="url" id="url-input" placeholder="youtube url" required>
        <input type="text" id="title-input" placeholder="custom title (optional)">
        <button type="submit" id="submit-btn">DOWNLOAD</button>
      </form>
    </section>

    <section id="status-section" hidden>
      <div id="status-display"></div>
    </section>

    <section id="tracks-section">
      <h2>tracks</h2>
      <ul id="tracks-list"></ul>
    </section>
  </main>

  <script src="/app.js"></script>
</body>
</html>
```

---

## `public/styles.css`

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0d0d0d;
  --fg: #ffffff;
  --muted: #888888;
  --accent: #39ff14;
  --error: #ff4444;
  --border: 1px solid #ffffff;
  --font: 'Courier New', Courier, monospace;
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.6;
  padding: 2rem;
}

main {
  max-width: 720px;
  margin: 0 auto;
}

h1 {
  font-size: 1.4rem;
  letter-spacing: 0.1em;
  text-transform: lowercase;
  border-bottom: var(--border);
  padding-bottom: 0.5rem;
  margin-bottom: 2rem;
}

h2 {
  font-size: 1rem;
  text-transform: lowercase;
  color: var(--muted);
  margin-bottom: 1rem;
}

/* Form */

#download-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 2rem;
}

input[type="url"],
input[type="text"] {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  font-size: 14px;
  border: var(--border);
  padding: 0.5rem 0.75rem;
  outline: none;
  width: 100%;
}

input[type="url"]:focus,
input[type="text"]:focus {
  outline: 1px solid var(--accent);
}

button {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  font-size: 14px;
  border: var(--border);
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  letter-spacing: 0.05em;
  align-self: flex-start;
}

button:hover {
  background: var(--fg);
  color: var(--bg);
}

button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Status */

#status-section {
  margin-bottom: 2rem;
  padding: 0.75rem;
  border: var(--border);
}

#status-display {
  font-size: 13px;
  word-break: break-all;
}

.status-queued  { color: var(--muted); }
.status-running { color: var(--accent); }
.status-done    { color: var(--fg); }
.status-error   { color: var(--error); }

/* Tracks */

#tracks-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.track-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0.75rem;
  border: var(--border);
}

.track-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.track-actions a,
.track-actions button {
  font-size: 12px;
  color: var(--muted);
  text-decoration: none;
  border: none;
  background: none;
  cursor: pointer;
  padding: 0;
}

.track-actions a:hover,
.track-actions button:hover {
  color: var(--fg);
  background: none;
}

.copy-feedback {
  color: var(--accent);
  font-size: 11px;
}

/* Utility */
[hidden] { display: none !important; }
```

---

## `public/app.js`

Plain JavaScript. No bundler, no TypeScript.

```javascript
const form = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const titleInput = document.getElementById("title-input");
const submitBtn = document.getElementById("submit-btn");
const statusSection = document.getElementById("status-section");
const statusDisplay = document.getElementById("status-display");
const tracksList = document.getElementById("tracks-list");

let pollInterval = null;

// ── Form submit ──────────────────────────────────────────────────────────────

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const url = urlInput.value.trim();
  const title = titleInput.value.trim();

  stopPolling();
  setStatus("queued", "queued...");
  statusSection.hidden = false;
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title: title || undefined }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStatus("error", `error: ${body.error ?? res.statusText}`);
      submitBtn.disabled = false;
      return;
    }

    const { jobId } = await res.json();
    pollInterval = setInterval(() => pollJob(jobId), 1000);
  } catch (err) {
    setStatus("error", `error: ${err.message}`);
    submitBtn.disabled = false;
  }
});

// ── Polling ──────────────────────────────────────────────────────────────────

async function pollJob(jobId) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) return;

    const job = await res.json();

    if (job.status === "queued") {
      setStatus("queued", "queued...");
    } else if (job.status === "running") {
      setStatus("running", job.progress ?? "running...");
    } else if (job.status === "finished") {
      stopPolling();
      const url = job.track?.url ?? "";
      const title = job.track?.title ?? "track";
      setStatus("done", `done. <a href="${url}">${escHtml(title)}</a>`);
      submitBtn.disabled = false;
      urlInput.value = "";
      titleInput.value = "";
      loadTracks();
    } else if (job.status === "failed") {
      stopPolling();
      setStatus("error", `error: ${escHtml(job.error ?? "unknown error")}`);
      submitBtn.disabled = false;
    }
  } catch {
    // network hiccup — keep polling
  }
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── Status display ────────────────────────────────────────────────────────────

function setStatus(type, html) {
  statusDisplay.className = `status-${type}`;
  statusDisplay.innerHTML = html;
}

// ── Tracks list ───────────────────────────────────────────────────────────────

async function loadTracks() {
  try {
    const res = await fetch("/api/tracks");
    if (!res.ok) return;
    const tracks = await res.json();
    renderTracks(tracks);
  } catch {
    // silently fail
  }
}

function renderTracks(tracks) {
  tracksList.innerHTML = "";

  if (tracks.length === 0) {
    const li = document.createElement("li");
    li.style.color = "var(--muted)";
    li.textContent = "no tracks yet.";
    tracksList.appendChild(li);
    return;
  }

  for (const track of tracks) {
    const li = document.createElement("li");
    li.className = "track-item";

    const titleSpan = document.createElement("span");
    titleSpan.className = "track-title";
    titleSpan.textContent = track.title;

    const actions = document.createElement("div");
    actions.className = "track-actions";

    const playLink = document.createElement("a");
    playLink.href = track.url;
    playLink.textContent = "▶ play";
    playLink.target = "_blank";

    const copyBtn = document.createElement("button");
    copyBtn.textContent = "copy url";
    copyBtn.addEventListener("click", async () => {
      const fullUrl = `${location.origin}${track.url}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
        const orig = copyBtn.textContent;
        copyBtn.textContent = "copied!";
        copyBtn.className = "copy-feedback";
        setTimeout(() => {
          copyBtn.textContent = orig;
          copyBtn.className = "";
        }, 1500);
      } catch {
        copyBtn.textContent = "failed";
      }
    });

    actions.appendChild(playLink);
    actions.appendChild(copyBtn);

    li.appendChild(titleSpan);
    li.appendChild(actions);
    tracksList.appendChild(li);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadTracks();
```

---

## Manual Verification Checklist

Start the server (Phase 7 is needed for the full wiring, but you can test the UI by temporarily hardcoding a server start at the bottom of `server.ts` for now, or just proceed to Phase 7 first and come back).

- [ ] Page loads without console errors
- [ ] Form is visible with correct styling (dark bg, white outlines, monospace)
- [ ] Submitting a valid YouTube URL creates a job and shows "queued..."
- [ ] Progress line updates while running
- [ ] On success: "done." with a working MP3 link appears
- [ ] On failure: error message appears in red
- [ ] Tracks list populates after success
- [ ] "copy url" copies the full URL to clipboard
- [ ] MP3 link opens/streams in browser
- [ ] Page reload: tracks list repopulates from server

---

## Notes

- `escHtml` is used when inserting user-supplied strings as HTML (job errors, track titles in the done message). Track titles in `renderTracks` use `.textContent` which is inherently safe.
- The `setStatus("done", html)` call uses `innerHTML` — only call it with the escaped output of `escHtml`.
- No `<script type="module">` needed — plain classic script, no imports.

---

## Commit When Done

```sh
git add public/
git commit -m "Phase 6: implement frontend UI"
```
