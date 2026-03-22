export interface DownloadOptions {
  url: string;
  outputTemplate: string;
  onProgress?: (line: string) => void;
  ytdlpPath?: string;
}

export function parseProgressLine(line: string): string | null {
  throw new Error("not implemented");
}
export async function fetchTitle(url: string, ytdlpPath?: string): Promise<string> {
  throw new Error("not implemented");
}
export async function downloadAudio(opts: DownloadOptions): Promise<void> {
  throw new Error("not implemented");
}
