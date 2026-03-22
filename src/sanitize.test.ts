import { test, expect, describe } from "bun:test";
import { sanitizeFilename, generateFilename, isAllowedUrl, isPlaylistUrl } from "./sanitize";

describe("sanitizeFilename", () => {
  test("removes path separator characters", () => {
    expect(sanitizeFilename("my/song")).toBe("mysong");
    expect(sanitizeFilename("my\\song")).toBe("mysong");
  });

  test("removes other forbidden characters", () => {
    expect(sanitizeFilename('file:name*?"<>|')).toBe("filename");
  });

  test("removes control characters", () => {
    expect(sanitizeFilename("song\x00name\x1fname")).toBe("songnamename");
  });

  test("collapses multiple whitespace to single space", () => {
    expect(sanitizeFilename("my   song   title")).toBe("my song title");
  });

  test("trims leading and trailing whitespace", () => {
    expect(sanitizeFilename("  my song  ")).toBe("my song");
  });

  test("limits to 120 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(120);
  });

  test("falls back to 'track' for empty result", () => {
    expect(sanitizeFilename("///")).toBe("track");
    expect(sanitizeFilename("   ")).toBe("track");
    expect(sanitizeFilename("")).toBe("track");
  });

  test("preserves normal characters", () => {
    expect(sanitizeFilename("My Favorite Song (Live)")).toBe("My Favorite Song (Live)");
  });
});

describe("generateFilename", () => {
  test("produces safeTitle__shortId.mp3 format", () => {
    const filename = generateFilename("My Song", "550e8400-e29b-41d4");
    expect(filename).toBe("My Song__550e8400.mp3");
  });

  test("sanitizes the title portion", () => {
    const filename = generateFilename("My/Song", "abc12345-xxxx");
    expect(filename).not.toContain("/");
    expect(filename).toMatch(/\.mp3$/);
  });

  test("uses first 8 chars of job ID", () => {
    const filename = generateFilename("Song", "abcdefgh-1234-5678");
    expect(filename).toContain("__abcdefgh");
  });
});

describe("isAllowedUrl", () => {
  test("allows youtube.com", () => {
    expect(isAllowedUrl("https://youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows www.youtube.com", () => {
    expect(isAllowedUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows m.youtube.com", () => {
    expect(isAllowedUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows music.youtube.com", () => {
    expect(isAllowedUrl("https://music.youtube.com/watch?v=abc")).toBe(true);
  });
  test("allows youtu.be", () => {
    expect(isAllowedUrl("https://youtu.be/abc123")).toBe(true);
  });
  test("rejects other domains", () => {
    expect(isAllowedUrl("https://vimeo.com/video")).toBe(false);
    expect(isAllowedUrl("https://evil.youtube.com.hacker.io/x")).toBe(false);
  });
  test("rejects invalid URLs", () => {
    expect(isAllowedUrl("not-a-url")).toBe(false);
    expect(isAllowedUrl("")).toBe(false);
  });
});

describe("isPlaylistUrl", () => {
  test("detects list= parameter", () => {
    expect(isPlaylistUrl("https://www.youtube.com/watch?v=abc&list=PLxxx")).toBe(true);
  });
  test("returns false for regular video URLs", () => {
    expect(isPlaylistUrl("https://www.youtube.com/watch?v=abc")).toBe(false);
  });
  test("returns false for youtu.be links without list", () => {
    expect(isPlaylistUrl("https://youtu.be/abc123")).toBe(false);
  });
});
