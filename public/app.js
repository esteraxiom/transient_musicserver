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
