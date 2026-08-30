export type ByteRange = { start: number; end: number };

export function parseByteRange(header: string, size: number): ByteRange | "invalid" {
  if (size <= 0 || !header.startsWith("bytes=") || header.includes(",")) return "invalid";

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match) return "invalid";

  const [, startText, endText] = match;
  if (!startText && !endText) return "invalid";

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= size ||
    requestedEnd < start
  ) {
    return "invalid";
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}
