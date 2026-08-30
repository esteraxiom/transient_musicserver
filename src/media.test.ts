import { describe, expect, test } from "bun:test";
import { parseByteRange } from "./media";

describe("parseByteRange", () => {
  test("parses bounded and open-ended ranges", () => {
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
  });

  test("parses suffix ranges", () => {
    expect(parseByteRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
    expect(parseByteRange("bytes=-200", 100)).toEqual({ start: 0, end: 99 });
  });

  test("clamps the end and rejects unsatisfiable ranges", () => {
    expect(parseByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
    expect(parseByteRange("bytes=20-10", 100)).toBe("invalid");
  });

  test("rejects malformed and multiple ranges", () => {
    expect(parseByteRange("items=0-1", 100)).toBe("invalid");
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBe("invalid");
    expect(parseByteRange("bytes=-0", 100)).toBe("invalid");
  });
});
