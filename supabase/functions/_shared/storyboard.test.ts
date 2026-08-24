import { describe, it, expect, afterEach, vi } from "vitest";
import {
  assignTimings,
  buildStoryboard,
  planPanelCount,
  MIN_PANELS,
  MAX_PANELS,
  type TranscriptSegment,
} from "./storyboard";

describe("planPanelCount", () => {
  it("gives a panel every few seconds, not every quarter minute", () => {
    // 15s per panel turned a 42s anecdote into three frozen images.
    expect(planPanelCount(60)).toBe(15);
    expect(planPanelCount(42)).toBeGreaterThanOrEqual(10);
  });

  it("honours an explicit density, the main cost lever", () => {
    expect(planPanelCount(60, 10)).toBe(6);
    expect(planPanelCount(60, 2)).toBe(24);
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

describe("storyboard provider selection", () => {
  const stubEnv = (env: Record<string, string | undefined>) =>
    vi.stubGlobal("Deno", { env: { get: (k: string) => env[k] } });

  afterEach(() => vi.unstubAllGlobals());

  it("runs on FAL_KEY alone — no OpenAI key required", async () => {
    stubEnv({ FAL_KEY: "fal-test" });
    let calledUrl = "";
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calledUrl = String(url);
      const auth = (init.headers as Record<string, string>).Authorization;
      expect(auth).toBe("Key fal-test");
      return Promise.resolve(
        new Response(
          JSON.stringify({
            // Chat models fence their JSON even when told not to.
            output: '```json\n{"cast":"le narrateur, 30 ans","scenes":[{"caption":"a","description":"une gare vide la nuit"}]}\n```',
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    });

    const board = await buildStoryboard({
      title: "La gare",
      transcription: "J'ai raté le dernier train.",
      durationSec: 45,
      panelCount: 1,
    });

    expect(calledUrl).toContain("fal.run/fal-ai/any-llm");
    expect(board.cast).toBe("le narrateur, 30 ans");
    expect(board.scenes[0].description).toBe("une gare vide la nuit");
    expect(board.scenes[0].end_ms).toBe(45000);
  });

  it("prefers OpenAI when both keys are present", async () => {
    stubEnv({ FAL_KEY: "fal-test", OPENAI_API_KEY: "sk-test" });
    let calledUrl = "";
    vi.stubGlobal("fetch", (url: string) => {
      calledUrl = String(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"cast":"x","scenes":[{"caption":"a","description":"b"}]}' } }],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      );
    });

    await buildStoryboard({ title: "t", transcription: "x", durationSec: 30, panelCount: 1 });
    expect(calledUrl).toContain("api.openai.com");
  });

  it("refuses clearly when neither key is set", async () => {
    stubEnv({});
    await expect(
      buildStoryboard({ title: "t", transcription: "x", durationSec: 30, panelCount: 1 })
    ).rejects.toThrow(/OPENAI_API_KEY.*FAL_KEY/);
  });
});
