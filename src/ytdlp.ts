export interface DownloadOptions {
  url: string;
  outputTemplate: string;
  onProgress?: (line: string) => void;
  ytdlpPath?: string;
  cookiesPath?: string;
  proxy?: string;
  signal?: AbortSignal;
}

export interface YtdlpAccessOptions {
  cookiesPath?: string;
  proxy?: string;
}

export function buildAccessArgs(opts: YtdlpAccessOptions): string[] {
  const args = ["--js-runtimes", "bun"];
  if (opts.cookiesPath) args.push("--cookies", opts.cookiesPath);
  if (opts.proxy) args.push("--proxy", opts.proxy);
  return args;
}

function errorDetail(stderr: string): string {
  const lines = stderr.split("\n").map(line => line.trim()).filter(Boolean);
  const error = lines.reverse().find(line => line.startsWith("ERROR:"));
  return (error ?? "").replace(/^ERROR:\s*/, "").slice(0, 500);
}

export function parseProgressLine(line: string): string | null {
  if (line.startsWith("[download]") && line.includes("%")) {
    return line;
  }
  return null;
}

export async function fetchTitle(
  url: string,
  ytdlpPath = "yt-dlp",
  signal?: AbortSignal,
  cookiesPath?: string,
  proxy?: string,
): Promise<string> {
  const proc = Bun.spawn(
    [ytdlpPath, ...buildAccessArgs({ cookiesPath, proxy }), "--no-playlist", "--print", "%(title)s", url],
    { stdout: "pipe", stderr: "pipe", signal }
  );

  const [exitCode, text, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    const detail = errorDetail(stderr);
    throw new Error(`yt-dlp exited with code ${exitCode} during title fetch${detail ? `: ${detail}` : ""}`);
  }

  return text.trim();
}

export async function downloadAudio(opts: DownloadOptions): Promise<void> {
  const ytdlpPath = opts.ytdlpPath ?? "yt-dlp";

  const proc = Bun.spawn(
    [
      ytdlpPath,
      ...buildAccessArgs(opts),
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
    { stdout: "pipe", stderr: "pipe", signal: opts.signal }
  );

  let lastError = "";
  async function consume(stream: ReadableStream<Uint8Array>, captureErrors: boolean) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    function handleLine(line: string) {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (captureErrors && trimmed.startsWith("ERROR:")) lastError = errorDetail(trimmed);
      const parsed = parseProgressLine(trimmed);
      if (parsed) opts.onProgress?.(parsed);
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    }
    handleLine(buffer);
  }

  const [exitCode] = await Promise.all([
    proc.exited,
    consume(proc.stdout, false),
    consume(proc.stderr, true),
  ]);
  if (exitCode !== 0) {
    throw new Error(`yt-dlp exited with code ${exitCode}${lastError ? `: ${lastError}` : ""}`);
  }
}
