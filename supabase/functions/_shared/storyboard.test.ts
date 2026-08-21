import { describe, it, expect } from "vitest";
import { assignTimings, planPanelCount, MIN_PANELS, MAX_PANELS, type TranscriptSegment } from "./storyboard";

describe("planPanelCount", () => {
  it("scales with duration, roughly one panel per 15 seconds", () => {
    expect(planPanelCount(60)).toBe(4);
    expect(planPanelCount(90)).toBe(6);
  });

  it("stays within the readable range", () => {
    expect(planPanelCount(5)).toBe(MIN_PANELS);
    expect(planPanelCount(600)).toBe(MAX_PANELS);
  });

  it("survives a missing or nonsense duration", () => {
    expect(planPanelCount(0)).toBe(MIN_PANELS);
    expect(planPanelCount(NaN)).toBe(MIN_PANELS);
    expect(planPanelCount(-10)).toBe(MIN_PANELS);
  });
});

describe("assignTimings", () => {
  const segments: TranscriptSegment[] = [
    { start_ms: 0, end_ms: 2000, text: "a" },
    { start_ms: 2000, end_ms: 5000, text: "b" },
    { start_ms: 5000, end_ms: 9000, text: "c" },
    { start_ms: 9000, end_ms: 12000, text: "d" },
    { start_ms: 12000, end_ms: 16000, text: "e" },
    { start_ms: 16000, end_ms: 20000, text: "f" },
  ];

  it("covers the whole audio with no gap and no overlap", () => {
    const timings = assignTimings(3, segments, 20000);
    expect(timings).toHaveLength(3);
    expect(timings[0].start_ms).toBe(0);
    expect(timings[timings.length - 1].end_ms).toBe(20000);
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i].start_ms).toBe(timings[i - 1].end_ms);
    }
  });

  it("cuts on segment boundaries so panels change between sentences", () => {
    const boundaries = new Set(segments.map((s) => s.end_ms));
    const timings = assignTimings(3, segments, 20000);
    // Every internal cut lands on a real segment end.
    for (let i = 0; i < timings.length - 1; i++) {
      expect(boundaries.has(timings[i].end_ms)).toBe(true);
    }
  });

  it("falls back to an even split when there are no segments", () => {
    const timings = assignTimings(4, null, 20000);
    expect(timings).toEqual([
      { start_ms: 0, end_ms: 5000 },
      { start_ms: 5000, end_ms: 10000 },
      { start_ms: 10000, end_ms: 15000 },
      { start_ms: 15000, end_ms: 20000 },
    ]);
  });

  it("ignores malformed segments rather than producing broken panels", () => {
    const broken: TranscriptSegment[] = [
      { start_ms: 0, end_ms: 0, text: "zero length" },
      { start_ms: NaN, end_ms: 5000, text: "not a number" },
    ];
    const timings = assignTimings(2, broken, 10000);
    expect(timings).toEqual([
      { start_ms: 0, end_ms: 5000 },
      { start_ms: 5000, end_ms: 10000 },
    ]);
  });

  it("never lets two panels collapse onto the same instant", () => {
    const timings = assignTimings(8, segments, 20000);
    for (const t of timings) {
      expect(t.end_ms).toBeGreaterThan(t.start_ms);
    }
  });

  it("always produces exactly the requested number of panels", () => {
    for (const n of [1, 3, 5, 8]) {
      expect(assignTimings(n, segments, 20000)).toHaveLength(n);
    }
  });
});
