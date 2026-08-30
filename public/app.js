const form = document.getElementById("download-form");
const urlInput = document.getElementById("url-input");
const titleInput = document.getElementById("title-input");
const submitBtn = document.getElementById("submit-btn");
const statusSection = document.getElementById("status-section");
const statusDisplay = document.getElementById("status-display");
const tracksList = document.getElementById("tracks-list");
const storageDisplay = document.getElementById("storage-display");
const storageFill = document.getElementById("storage-fill");
const storageTrack = document.querySelector(".storage-track");
const refreshBtn = document.getElementById("refresh-btn");

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
    const [tracksRes] = await Promise.all([fetch("/api/tracks"), loadStatus()]);
    if (!tracksRes.ok) return;
    const tracks = await tracksRes.json();
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

    const sizeSpan = document.createElement("span");
    sizeSpan.className = "track-size";
    sizeSpan.textContent = formatBytes(track.bytes);

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
        await copyText(fullUrl);
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

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "delete";
    deleteBtn.className = "delete-action";
    deleteBtn.setAttribute("aria-label", `Delete ${track.title}`);
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(`Permanently delete "${track.title}"?`)) return;
      deleteBtn.disabled = true;
      const res = await fetch(`/api/tracks/${track.id}`, { method: "DELETE" });
      if (res.ok) {
        await loadTracks();
      } else {
        deleteBtn.disabled = false;
        alert("Delete failed.");
      }
    });

    actions.appendChild(playLink);
    actions.appendChild(copyBtn);
    actions.appendChild(deleteBtn);

    const identity = document.createElement("div");
    identity.className = "track-identity";
    identity.appendChild(titleSpan);
    identity.appendChild(sizeSpan);

    li.appendChild(identity);
    li.appendChild(actions);
    tracksList.appendChild(li);
  }
}

async function loadStatus() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const status = await res.json();
    const percentage = status.limitBytes > 0
      ? Math.min(100, (status.usedBytes / status.limitBytes) * 100)
      : 100;
    storageDisplay.textContent = `${formatBytes(status.usedBytes)} / ${formatBytes(status.limitBytes)}`;
    storageFill.style.width = `${percentage}%`;
    storageTrack.setAttribute("aria-valuenow", String(Math.round(percentage)));
    submitBtn.disabled = !status.acceptingJobs;
    storageDisplay.classList.toggle("storage-blocked", !status.acceptingJobs);
    if (!status.acceptingJobs) storageDisplay.title = status.reason ?? "Storage unavailable";
  } catch {
    storageDisplay.textContent = "unavailable";
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard unavailable");
}

// ── Init ──────────────────────────────────────────────────────────────────────

refreshBtn.addEventListener("click", loadTracks);
loadTracks();
