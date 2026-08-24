/**
 * Caption boxes burned into the story video.
 *
 * The text is composited here rather than drawn by the image model. Image
 * models render text badly — French accents especially — and would never
 * reproduce the speaker's exact words. Typesetting it ourselves gives the real
 * transcription, perfectly legible, in a consistent style, and costs nothing
 * per generation.
 *
 * These are comic caption boxes (the récitatif of a bande dessinée), not
 * speech balloons: a balloon has to point at whoever is talking, and nothing
 * tells us where that character landed in a generated panel.
 */

export interface Caption {
  text: string;
  start_ms: number;
  end_ms: number;
}

export interface TimedSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface PanelWindow {
  start_ms: number;
  end_ms: number;
}

/** Roughly what fits on one line at the caption's size on a 1080-wide frame. */
export const MAX_LINE_CHARS = 34;
export const MAX_LINES = 3;

/**
 * Wraps on word boundaries, and truncates rather than overflowing the frame.
 *
 * A word longer than a whole line is hard-split: without that the line would
 * run off the edge, which is worse than an ugly break.
 */
export function wrapText(text: string, maxChars = MAX_LINE_CHARS, maxLines = MAX_LINES): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (word.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
      line = lines.pop() ?? "";
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  if (lines.length <= maxLines) return lines.join("\n");

  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/, "")}…`;
  return kept.join("\n");
}

/**
 * The words actually spoken while a panel is on screen.
 *
 * A segment counts for the panel it overlaps most, so a sentence straddling a
 * cut appears once rather than being split across two boxes.
 */
export function captionsForPanels(
  panels: PanelWindow[],
  segments: TimedSegment[]
): Caption[] {
  const parts: string[][] = panels.map(() => []);

  // Each segment goes to exactly one panel — the one it overlaps most, ties to
  // the earlier. Deciding per panel instead lets a sentence sitting exactly on
  // a cut clear the threshold on both sides and appear twice.
  for (const seg of segments) {
    let best = -1;
    let bestOverlap = 0;
    panels.forEach((panel, i) => {
      const overlap = Math.min(panel.end_ms, seg.end_ms) - Math.max(panel.start_ms, seg.start_ms);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = i;
      }
    });
    if (best >= 0) parts[best].push(seg.text);
  }

  return panels.map((panel, i) => ({
    text: wrapText(parts[i].join(" ")),
    start_ms: panel.start_ms,
    end_ms: panel.end_ms,
  }));
}

/** ffmpeg reads filter option values delimited by ':' and quoted with "'". */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export interface CaptionStyleOptions {
  fontFile: string;
  fontSize?: number;
  /** Distance from the bottom of the frame to the bottom of the box. */
  marginBottom?: number;
}

/**
 * One drawtext filter per caption, each shown only while its panel is up.
 *
 * The text comes from a file rather than inline: ffmpeg's own escaping rules
 * for inline text are a minefield of colons, quotes and percent signs, and an
 * apostrophe is guaranteed in French.
 */
export function drawtextFilters(
  captions: Caption[],
  captionFiles: string[],
  opts: CaptionStyleOptions
): string[] {
  const fontSize = opts.fontSize ?? 44;
  const marginBottom = opts.marginBottom ?? 260;

  const filters: string[] = [];
  captions.forEach((caption, i) => {
    if (!caption.text.trim()) return;
    const from = (caption.start_ms / 1000).toFixed(3);
    const to = (caption.end_ms / 1000).toFixed(3);
    filters.push(
      [
        `drawtext=textfile='${escapeFilterPath(captionFiles[i])}'`,
        `fontfile='${escapeFilterPath(opts.fontFile)}'`,
        `fontsize=${fontSize}`,
        "fontcolor=white",
        "line_spacing=12",
        "box=1",
        // Ink-dark rather than pure black: it sits better over flat colour.
        "boxcolor=0x17151A@0.72",
        "boxborderw=28",
        "x=(w-text_w)/2",
        `y=h-text_h-${marginBottom}`,
        `enable='between(t,${from},${to})'`,
      ].join(":")
    );
  });
  return filters;
}

/** Font files to try, in order. The first that exists on the box is used. */
export const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
];
