import type { Database } from "bun:sqlite";
import type { DownloadOptions } from "./ytdlp";

export interface JobQueue {
  enqueue(jobId: string): void;
  stop(): void;
}

export type YtdlpRunner = (opts: DownloadOptions) => Promise<void>;
export type TitleFetcher = (url: string, ytdlpPath?: string) => Promise<string>;

export function createQueue(
  db: Database,
  opts: {
    mediaDir: string;
    tmpDir: string;
    ytdlpRunner?: YtdlpRunner;
    titleFetcher?: TitleFetcher;
    ytdlpPath?: string;
  }
): JobQueue {
  throw new Error("not implemented");
}
