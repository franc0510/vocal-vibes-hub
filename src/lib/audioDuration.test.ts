import { describe, it, expect } from "vitest";
import { resolveDurationMs } from "./audioDuration";

describe("resolveDurationMs", () => {
  it("prefers the measured length — the counter always rounds down", () => {
    // The stopwatch said 44s; the file is really 44.312s.
    expect(resolveDurationMs(44312, 44)).toBe(44312);
  });

  it("falls back to the counter when nothing could be measured", () => {
    expect(resolveDurationMs(null, 44)).toBe(44000);
  });

  it("keeps the counter when the metadata is plainly wrong", () => {
    // A duration ten times the recording is a bad header, not a long take.
    expect(resolveDurationMs(440000, 44)).toBe(44000);
    expect(resolveDurationMs(1000, 44)).toBe(44000);
  });

  it("accepts a measurement slightly under the counter", () => {
    // The counter ticks on a timer, so it can overshoot by a beat.
    expect(resolveDurationMs(43500, 44)).toBe(43500);
  });

  it("never returns a negative duration", () => {
    expect(resolveDurationMs(null, -5)).toBe(0);
  });
});
