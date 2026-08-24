import { describe, it, expect } from "vitest";
import { buildConcatScript, ffmpegArgs, type VideoPanel } from "./assembleVideo";

const panels: VideoPanel[] = [
  { file: "/out/images/0.jpg", start_ms: 0, end_ms: 5000 },
  { file: "/out/images/1.jpg", start_ms: 5000, end_ms: 12000 },
  { file: "/out/images/2.jpg", start_ms: 12000, end_ms: 20000 },
];

describe("buildConcatScript", () => {
  it("gives each panel the duration its scene occupies", () => {
    const lines = buildConcatScript(panels).trim().split("\n");
    expect(lines).toContain("duration 5.000");
    expect(lines).toContain("duration 7.000");
    expect(lines).toContain("duration 8.000");
  });

  it("repeats the last file, or ffmpeg drops the closing panel to one frame", () => {
    const lines = buildConcatScript(panels).trim().split("\n");
    expect(lines[lines.length - 1]).toBe("file '/out/images/2.jpg'");
    // Three panels: three file+duration pairs, plus the repeat.
    expect(lines.filter((l) => l.startsWith("file ")).length).toBe(4);
  });

  it("escapes quotes in paths so a filename cannot break the script", () => {
    const script = buildConcatScript([
      { file: "/out/it's here.jpg", start_ms: 0, end_ms: 1000 },
    ]);
    expect(script).toContain("file '/out/it'\\''s here.jpg'");
  });

  it("never emits a zero or negative duration", () => {
    const script = buildConcatScript([
      { file: "/a.jpg", start_ms: 500, end_ms: 500 },
      { file: "/b.jpg", start_ms: 900, end_ms: 400 },
    ]);
    for (const line of script.split("\n").filter((l) => l.startsWith("duration"))) {
      expect(Number(line.split(" ")[1])).toBeGreaterThan(0);
    }
  });

  it("refuses an empty storyboard rather than producing a broken script", () => {
    expect(() => buildConcatScript([])).toThrow(/Aucune case/);
  });
});

describe("ffmpegArgs", () => {
  const args = ffmpegArgs("/w/concat.txt", "/w/audio.mp3", "/w/out.mp4");

  it("takes video from the panels and audio from the recording", () => {
    expect(args).toContain("-map");
    expect(args.join(" ")).toContain("-map 0:v");
    expect(args.join(" ")).toContain("-map 1:a");
  });

  it("produces a vertical 1080x1920 frame with no letterboxing", () => {
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("force_original_aspect_ratio=increase");
    expect(vf).toContain("crop=1080:1920");
  });

  it("encodes for playback anywhere: yuv420p and a faststart header", () => {
    expect(args.join(" ")).toContain("format=yuv420p");
    expect(args).toContain("+faststart");
  });

  it("ends with the voice rather than the last panel's nominal duration", () => {
    expect(args).toContain("-shortest");
  });

  it("writes to the requested output path", () => {
    expect(args[args.length - 1]).toBe("/w/out.mp4");
  });
});
