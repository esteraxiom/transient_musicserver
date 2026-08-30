import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { buildAccessArgs, parseProgressLine, fetchTitle, downloadAudio } from "./ytdlp";
import { join } from "path";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";

const FIXTURE_YTDLP = join(import.meta.dir, "../tests/fixtures/yt-dlp");

describe("parseProgressLine", () => {
  test("returns the line when it contains a download percentage", () => {
    const line = "[download]  43.2% of 5.00MiB at 1.00MiB/s ETA 00:03";
    expect(parseProgressLine(line)).toBe(line);
  });

  test("captures 100% completion line", () => {
    const line = "[download] 100% of 5.00MiB";
    expect(parseProgressLine(line)).toBe(line);
  });

  test("captures 0.0% start line", () => {
    const line = "[download]   0.0% of 5.00MiB";
    expect(parseProgressLine(line)).toBe(line);
  });

  test("returns null for non-download lines", () => {
    expect(parseProgressLine("[info] Downloading video")).toBeNull();
    expect(parseProgressLine("[ffmpeg] Converting audio")).toBeNull();
    expect(parseProgressLine("[youtube] Extracting URL")).toBeNull();
    expect(parseProgressLine("")).toBeNull();
  });
});

describe("buildAccessArgs", () => {
  test("enables Bun and adds optional cookies and proxy settings", () => {
    expect(buildAccessArgs({
      cookiesPath: "/run/secrets/musicserver/youtube-cookies.txt",
      proxy: "socks5://proxy.internal:1080",
    })).toEqual([
      "--js-runtimes", "bun",
      "--cookies", "/run/secrets/musicserver/youtube-cookies.txt",
      "--proxy", "socks5://proxy.internal:1080",
    ]);
  });

  test("does not add empty access settings", () => {
    expect(buildAccessArgs({})).toEqual(["--js-runtimes", "bun"]);
  });
});

describe("fetchTitle (using dummy yt-dlp)", () => {
  test("returns the title string from the dummy script", async () => {
    const title = await fetchTitle("https://www.youtube.com/watch?v=test", FIXTURE_YTDLP);
    expect(typeof title).toBe("string");
    expect(title.length).toBeGreaterThan(0);
    expect(title).toBe("Test Song Title");
  });
});

describe("downloadAudio (using dummy yt-dlp)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "ytdlp-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates an output .mp3 file at the expected path", async () => {
    const outputTemplate = join(tmpDir, "job123.%(ext)s");
    await downloadAudio({
      url: "https://www.youtube.com/watch?v=test",
      outputTemplate,
      ytdlpPath: FIXTURE_YTDLP,
    });
    expect(existsSync(join(tmpDir, "job123.mp3"))).toBe(true);
  });

  test("calls onProgress with progress lines", async () => {
    const progressLines: string[] = [];
    await downloadAudio({
      url: "https://www.youtube.com/watch?v=test",
      outputTemplate: join(tmpDir, "job456.%(ext)s"),
      ytdlpPath: FIXTURE_YTDLP,
      onProgress: (line) => progressLines.push(line),
    });
    expect(progressLines.length).toBeGreaterThan(0);
    expect(progressLines.some(l => l.includes("%"))).toBe(true);
  });

  test("rejects when the binary does not exist", async () => {
    await expect(
      downloadAudio({
        url: "https://www.youtube.com/watch?v=test",
        outputTemplate: join(tmpDir, "fail.%(ext)s"),
        ytdlpPath: "/nonexistent/yt-dlp-binary",
      })
    ).rejects.toThrow();
  });
});
