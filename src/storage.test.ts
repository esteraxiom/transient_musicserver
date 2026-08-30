import { describe, expect, test } from "bun:test";
import { evaluateStorage } from "./storage";

describe("evaluateStorage", () => {
  const defaults = {
    usedBytes: 100,
    limitBytes: 1_000,
    freeBytes: 2_000,
    minFreeBytes: 500,
    additionalBytes: 0,
  };

  test("accepts a download when both limits have room", () => {
    expect(evaluateStorage(defaults)).toEqual({ acceptingJobs: true, reason: null });
  });

  test("rejects when the library has reached its cap", () => {
    expect(evaluateStorage({ ...defaults, usedBytes: 1_000 })).toEqual({
      acceptingJobs: false,
      reason: "Library storage limit reached",
    });
  });

  test("rejects a completed file that would cross the cap", () => {
    expect(evaluateStorage({ ...defaults, usedBytes: 900, additionalBytes: 101 })).toEqual({
      acceptingJobs: false,
      reason: "Download would exceed the library storage limit",
    });
  });

  test("rejects when host free space is below the reserve", () => {
    expect(evaluateStorage({ ...defaults, freeBytes: 499 })).toEqual({
      acceptingJobs: false,
      reason: "Host free-space reserve reached",
    });
  });
});
