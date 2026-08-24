import { describe, it, expect } from "vitest";
import {
  wrapText,
  captionsForPanels,
  captionsFromSegments,
  drawtextFilters,
  MAX_LINE_CHARS,
  MAX_LINES,
  MIN_CAPTION_MS,
  type TimedSegment,
} from "./captions";

describe("wrapText", () => {
  it("breaks on words, never mid-word when the word fits", () => {
    const out = wrapText("J'étais avec Arthur et on sortait du bar tranquillement");
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    expect(out).not.toMatch(/Arthu\n/);
  });

  it("keeps accents intact — the whole reason we typeset this ourselves", () => {
    expect(wrapText("à côté de l'église")).toBe("à côté de l'église");
  });

  it("truncates with an ellipsis rather than overflowing the frame", () => {
    const long = "mot ".repeat(80);
    const out = wrapText(long);
    expect(out.split("\n")).toHaveLength(MAX_LINES);
    expect(out.endsWith("…")).toBe(true);
  });

  it("hard-splits a word longer than a line instead of running off the edge", () => {
    const out = wrapText("a".repeat(MAX_LINE_CHARS + 10));
    for (const line of out.split("\n")) expect(line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
  });

  it("returns nothing for empty input", () => {
    expect(wrapText("   ")).toBe("");
  });
});

describe("captionsForPanels", () => {
  const segments: TimedSegment[] = [
    { start_ms: 0, end_ms: 3000, text: "Voilà, petite histoire." },
    { start_ms: 3000, end_ms: 7000, text: "J'étais avec Arthur." },
    { start_ms: 7000, end_ms: 11000, text: "On sortait du bar." },
  ];
  const panels = [
    { start_ms: 0, end_ms: 5000 },
    { start_ms: 5000, end_ms: 12000 },
  ];

  it("gives each panel the words spoken while it is on screen", () => {
    const caps = captionsForPanels(panels, segments);
    expect(caps[0].text).toContain("petite histoire");
    expect(caps[1].text).toContain("bar");
  });

  it("assigns a sentence straddling a cut to one panel only", () => {
    const caps = captionsForPanels(panels, segments);
    const appearances = caps.filter((c) => c.text.includes("Arthur")).length;
    expect(appearances).toBe(1);
  });

  it("keeps the panel's own timing so the box appears with the panel", () => {
    const caps = captionsForPanels(panels, segments);
    expect(caps[0]).toMatchObject({ start_ms: 0, end_ms: 5000 });
    expect(caps[1]).toMatchObject({ start_ms: 5000, end_ms: 12000 });
  });

  it("produces an empty caption rather than failing when nothing was said", () => {
    const caps = captionsForPanels([{ start_ms: 50000, end_ms: 60000 }], segments);
    expect(caps[0].text).toBe("");
  });
});

describe("drawtextFilters", () => {
  const caps = [
    { text: "Bonjour", start_ms: 0, end_ms: 5000 },
    { text: "", start_ms: 5000, end_ms: 9000 },
    { text: "La suite", start_ms: 9000, end_ms: 12000 },
  ];
  const files = ["/w/cap-0.txt", "/w/cap-1.txt", "/w/cap-2.txt"];
  const filters = drawtextFilters(caps, files, { fontFile: "/f/DejaVuSans-Bold.ttf" });

  it("skips captions with no words instead of drawing an empty box", () => {
    expect(filters).toHaveLength(2);
  });

  it("shows each caption only while its panel is up", () => {
    expect(filters[0]).toContain("enable='between(t,0.000,5.000)'");
    expect(filters[1]).toContain("enable='between(t,9.000,12.000)'");
  });

  it("reads text from a file, since inline escaping breaks on an apostrophe", () => {
    expect(filters[0]).toContain("textfile='/w/cap-0.txt'");
    expect(filters[0]).not.toContain("text=Bonjour");
  });

  it("escapes colons in paths so the filter cannot be cut in half", () => {
    const [f] = drawtextFilters([caps[0]], ["/w/a:b.txt"], { fontFile: "/f/x.ttf" });
    expect(f).toContain("/w/a\\:b.txt");
  });

  it("centres the box and lifts it clear of the bottom edge", () => {
    expect(filters[0]).toContain("x=(w-text_w)/2");
    expect(filters[0]).toMatch(/y=h-text_h-\d+/);
  });
});

describe("captionsFromSegments", () => {
  it("gives each stretch of speech its own timing, so the text follows the voice", () => {
    const caps = captionsFromSegments([
      { start_ms: 0, end_ms: 2500, text: "Voilà, petite histoire." },
      { start_ms: 2500, end_ms: 6000, text: "J'étais avec Arthur." },
      { start_ms: 6000, end_ms: 9500, text: "On sortait du bar." },
    ]);
    expect(caps).toHaveLength(3);
    expect(caps[0]).toMatchObject({ start_ms: 0, end_ms: 2500 });
    expect(caps[2].text).toContain("bar");
  });

  it("merges a chunk too brief to read into the one before it", () => {
    const caps = captionsFromSegments([
      { start_ms: 0, end_ms: 2000, text: "Bon," },
      { start_ms: 2000, end_ms: 2400, text: "euh," },
      { start_ms: 2400, end_ms: 5000, text: "voilà." },
    ]);
    expect(caps.length).toBeLessThan(3);
    for (const c of caps) expect(c.end_ms - c.start_ms).toBeGreaterThanOrEqual(MIN_CAPTION_MS);
  });

  it("splits a chunk carrying more words than a box holds", () => {
    const long = "mot ".repeat(60).trim();
    const caps = captionsFromSegments([{ start_ms: 0, end_ms: 12000, text: long }]);
    expect(caps.length).toBeGreaterThan(1);
    // The pieces tile the original window without gap or overrun.
    expect(caps[0].start_ms).toBe(0);
    expect(caps[caps.length - 1].end_ms).toBe(12000);
    for (let i = 1; i < caps.length; i++) expect(caps[i].start_ms).toBe(caps[i - 1].end_ms);
  });

  it("never overlaps two captions, which would stack two boxes on screen", () => {
    const caps = captionsFromSegments([
      { start_ms: 0, end_ms: 3000, text: "Un." },
      { start_ms: 3000, end_ms: 6000, text: "Deux." },
      { start_ms: 6000, end_ms: 9000, text: "Trois." },
    ]);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i].start_ms).toBeGreaterThanOrEqual(caps[i - 1].end_ms);
    }
  });

  it("ignores empty or backwards chunks rather than emitting a blank box", () => {
    const caps = captionsFromSegments([
      { start_ms: 0, end_ms: 3000, text: "   " },
      { start_ms: 5000, end_ms: 4000, text: "à l'envers" },
      { start_ms: 6000, end_ms: 9000, text: "correct" },
    ]);
    expect(caps).toHaveLength(1);
    expect(caps[0].text).toBe("correct");
  });
});
