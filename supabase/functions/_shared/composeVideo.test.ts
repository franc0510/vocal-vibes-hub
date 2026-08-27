import { describe, it, expect } from "vitest";
import { buildTracks } from "./composeVideo";
import { realDurationMs, TAIL_PADDING_MS } from "./transcribe";

const panels = [
  { imageUrl: "http://i/0.jpg", start_ms: 0, end_ms: 4000 },
  { imageUrl: "http://i/1.jpg", start_ms: 4000, end_ms: 8000 },
  { imageUrl: "http://i/2.jpg", start_ms: 8000, end_ms: 12000 },
];

describe("buildTracks", () => {
  it("carries the panels and the voice as two tracks", () => {
    const tracks = buildTracks({ panels, audioUrl: "http://a.mp3", totalMs: 12000 });
    expect(tracks.map((t) => t.id)).toEqual(["panels", "voice"]);
    expect(tracks[0].keyframes).toHaveLength(3);
    expect(tracks[1].keyframes[0].url).toBe("http://a.mp3");
  });

  it("tiles the recording with no gap between panels", () => {
    const [panelTrack] = buildTracks({ panels, audioUrl: "http://a.mp3", totalMs: 12000 });
    for (let i = 1; i < panelTrack.keyframes.length; i++) {
      const previous = panelTrack.keyframes[i - 1];
      expect(previous.timestamp + previous.duration).toBe(panelTrack.keyframes[i].timestamp);
    }
  });

  it("stretches the last panel to the end of the audio — the truncation bug", () => {
    // The audio really runs to 13.5s though the panels only planned for 12s.
    const [panelTrack, audioTrack] = buildTracks({
      panels,
      audioUrl: "http://a.mp3",
      totalMs: 13500,
    });
    const last = panelTrack.keyframes[panelTrack.keyframes.length - 1];
    expect(last.timestamp + last.duration).toBe(13500);
    expect(audioTrack.keyframes[0].duration).toBe(13500);
  });

  it("never lets the audio outlive the panels, whatever the declared total", () => {
    const [panelTrack, audioTrack] = buildTracks({
      panels,
      audioUrl: "http://a.mp3",
      // A total shorter than the panels: the panels still win, so no black tail.
      totalMs: 5000,
    });
    const last = panelTrack.keyframes[panelTrack.keyframes.length - 1];
    expect(last.timestamp + last.duration).toBe(12000);
    expect(audioTrack.keyframes[0].duration).toBe(12000);
  });

  it("sorts panels that arrive out of order", () => {
    const [panelTrack] = buildTracks({
      panels: [panels[2], panels[0], panels[1]],
      audioUrl: "http://a.mp3",
      totalMs: 12000,
    });
    expect(panelTrack.keyframes.map((k) => k.url)).toEqual([
      "http://i/0.jpg",
      "http://i/1.jpg",
      "http://i/2.jpg",
    ]);
  });

  it("refuses an empty storyboard rather than composing nothing", () => {
    expect(() => buildTracks({ panels: [], audioUrl: "http://a.mp3", totalMs: 1000 })).toThrow(
      /Aucune planche/
    );
  });
});

describe("realDurationMs", () => {
  const segments = [
    { start_ms: 0, end_ms: 20000, text: "début" },
    { start_ms: 20000, end_ms: 44300, text: "la toute fin de la phrase" },
  ];

  it("beats the whole-second counter that was clipping the last words", () => {
    // The counter said 44s; the speech actually runs to 44.3s.
    expect(realDurationMs(44, segments)).toBe(44300 + TAIL_PADDING_MS);
  });

  it("prefers a precise millisecond duration when the client measured one", () => {
    expect(realDurationMs(44, [], 44_312)).toBe(44_312);
  });

  it("falls back to the declared seconds when nothing better exists", () => {
    // This is the dangerous case, and the reason the import script transcribes
    // before composing: an old post has no duration_ms and, if transcription
    // was broken when it was published, no segments either. Nothing here can
    // recover the missing fraction of a second — so the caller must supply
    // segments rather than trust this fallback.
    expect(realDurationMs(44, [])).toBe(44000);
  });

  it("is beaten by segments as soon as there are any — hence transcribing first", () => {
    const withSegments = realDurationMs(44, [{ start_ms: 0, end_ms: 44_300, text: "fin" }]);
    const without = realDurationMs(44, []);
    expect(withSegments).toBeGreaterThan(without);
  });

  it("never returns less than what was actually spoken", () => {
    expect(realDurationMs(10, segments)).toBeGreaterThan(44000);
  });
});
