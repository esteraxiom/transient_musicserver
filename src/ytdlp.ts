export interface DownloadOptions {
  url: string;
  outputTemplate: string;
  onProgress?: (line: string) => void;
  ytdlpPath?: string;
  signal?: AbortSignal;
}

export function parseProgressLine(line: string): string | null {
  if (line.startsWith("[download]") && line.includes("%")) {
    return line;
  }
  return null;
}

export async function fetchTitle(url: string, ytdlpPath = "yt-dlp", signal?: AbortSignal): Promise<string> {
  const proc = Bun.spawn(
    [ytdlpPath, "--no-playlist", "--print", "%(title)s", url],
    { stdout: "pipe", stderr: "ignore", signal }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`yt-dlp exited with code ${exitCode} during title fetch`);
  }

  const text = await new Response(proc.stdout).text();
  return text.trim();
}

export async function downloadAudio(opts: DownloadOptions): Promise<void> {
  const ytdlpPath = opts.ytdlpPath ?? "yt-dlp";

  const proc = Bun.spawn(
    [
      ytdlpPath,
      "--extract-audio",
      "--audio-format", "mp3",
      "--format", "bestaudio/best",
      "--max-filesize", "1G",
      "--no-cache-dir",
      "--no-playlist",
      "--newline",
      "-o", opts.outputTemplate,
      opts.url,
    ],
    { stdout: "ignore", stderr: "pipe", signal: opts.signal }
  );

  const reader = proc.stderr.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = parseProgressLine(trimmed);
      if (parsed) opts.onProgress?.(parsed);
    }
  }

  if (buffer.trim()) {
    const parsed = parseProgressLine(buffer.trim());
    if (parsed) opts.onProgress?.(parsed);
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`yt-dlp exited with code ${exitCode}`);
  }
}
