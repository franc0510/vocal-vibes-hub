/**
 * Style bibles for story illustrations.
 *
 * This is where all the art direction lives. Changing how VocMe illustrations
 * look should mean editing this file and nothing else — the Edge Function and
 * the benchmark script both read from here.
 */

export interface StyleBible {
  id: string;
  label: string;
  /** Prepended to every panel prompt. Carries the whole visual identity. */
  prefix: string;
  /** Appended after the scene description, to close out the framing rules. */
  suffix: string;
  /** What the model must avoid. Used natively where supported, folded into the prompt otherwise. */
  negative: string;
  /**
   * Reference artwork from our illustrator, passed as image input where the
   * provider supports it. Phase B of the art plan: transfers the artist's
   * choices without any training. Empty until we have the commissioned pack.
   */
  referenceImages: string[];
  /**
   * Trained LoRA for this style (phase C). fal-only. `null` means we are still
   * relying on the written bible and reference images.
   */
  lora: { path: string; scale: number } | null;
}

const LIGNE_CLAIRE: StyleBible = {
  id: "ligne-claire",
  label: "BD franco-belge / ligne claire",
  prefix: [
    "Franco-Belgian comic book panel in the ligne claire tradition.",
    "Uniform-weight black ink outlines, no hatching, no cross-hatching, no stippling.",
    "Flat unmodulated colour fills inside the outlines, no airbrushing and no soft gradients.",
    "Restrained printed palette: warm off-white paper, deep warm black ink,",
    "printed blue #1B5FA8, vermilion red #C8352A, ochre #B67F0E, muted green #2E7D5B.",
    "Even ambient daylight, minimal shadow, shadows rendered as a single flat darker tone.",
    "Clear staging: one readable action per panel, characters shown full or three-quarter length,",
    "generous negative space, horizon and architecture drawn with confident straight perspective.",
    "Faces are simple and expressive with few lines; hands are drawn, not hidden.",
  ].join(" "),
  suffix: [
    "Vertical 9:16 composition, subject centred and clear of the outer 12% margin",
    "so nothing important is lost behind interface overlays.",
    "The image must read at thumbnail size.",
  ].join(" "),
  negative: [
    "photorealistic, photograph, 3D render, octane, unreal engine, digital painting,",
    "airbrush, soft focus, bokeh, lens flare, dramatic cinematic lighting, heavy shadows,",
    "manga, anime, chibi, superhero comic, american comic shading,",
    "speech bubbles, captions, lettering, watermark, signature, logo, text of any kind,",
    "extra fingers, deformed hands, distorted face, cropped head, blurry, low quality,",
    "grid of panels, multi-panel layout, comic page, borders, frames",
  ].join(" "),
  referenceImages: [],
  lora: null,
};

export const STYLES: Record<string, StyleBible> = {
  [LIGNE_CLAIRE.id]: LIGNE_CLAIRE,
};

export const DEFAULT_STYLE_ID = LIGNE_CLAIRE.id;

export function getStyle(styleId?: string | null): StyleBible {
  return STYLES[styleId ?? ""] ?? STYLES[DEFAULT_STYLE_ID];
}

/**
 * Assembles the final prompt for one panel.
 *
 * `castSheet` is the frozen physical description of the anecdote's characters.
 * It is injected verbatim into every panel — this is what stops the
 * protagonist from changing face between panel 1 and panel 6.
 */
export function buildPanelPrompt(
  style: StyleBible,
  castSheet: string,
  sceneDescription: string
): string {
  const parts = [style.prefix];
  if (castSheet.trim()) {
    parts.push(`Recurring characters, to be drawn exactly the same in every panel: ${castSheet.trim()}`);
  }
  parts.push(`Scene: ${sceneDescription.trim()}`);
  parts.push(style.suffix);
  return parts.join("\n\n");
}
