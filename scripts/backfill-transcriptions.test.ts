import { describe, it, expect } from "vitest";
import { needsWork } from "./backfill-transcriptions";

/**
 * Two ways to be missing a transcription, and only one of them is obvious.
 *
 * A post can carry text with no timestamps — that is what the old manual field
 * produced, and what a provider that returns no chunks produces. The app can
 * print such text, but nothing can align it with the voice: no captions in
 * step, and no storyboard later. Treating it as "already done" would leave
 * those anecdotes half-equipped forever.
 */
const post = (over: Record<string, unknown> = {}) =>
  ({
    id: "p",
    title: "t",
    audio_url: "u",
    duration: 30,
    duration_ms: null,
    transcription: null,
    transcription_segments: null,
    ...over,
  }) as Parameters<typeof needsWork>[0];

describe("needsWork", () => {
  it("prend une anecdote sans rien", () => {
    expect(needsWork(post())).toBe(true);
  });

  it("prend une anecdote au texte vide", () => {
    expect(needsWork(post({ transcription: "   " }))).toBe(true);
  });

  it("prend un texte sans horodatage — le piège", () => {
    expect(needsWork(post({ transcription: "des mots", transcription_segments: null }))).toBe(true);
  });

  it("prend un texte dont la liste de segments est vide", () => {
    expect(needsWork(post({ transcription: "des mots", transcription_segments: [] }))).toBe(true);
  });

  it("laisse tranquille une anecdote complète", () => {
    expect(
      needsWork(
        post({
          transcription: "des mots",
          transcription_segments: [{ start_ms: 0, end_ms: 900, text: "des mots" }],
        })
      )
    ).toBe(false);
  });
});
