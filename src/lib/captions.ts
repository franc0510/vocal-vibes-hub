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
/** Below this a caption flashes past before it can be read. */
export const MIN_CAPTION_MS = 1200;
/** Above this the box has to be split, or it outlives what is being said. */
export const MAX_CAPTION_CHARS = MAX_LINE_CHARS * MAX_LINES;

/**
 * Subtitles that follow the voice, one caption per stretch of speech.
 *
 * Captions used to be built per panel: a whole panel's worth of words sat
 * frozen on screen for as long as the image did, which is exactly what
 * "doesn't follow the audio" looks like. Timing them to Whisper's own chunks
 * makes the text change as the sentence is spoken.
 *
 * Two adjustments keep it readable: chunks too brief to read are merged with
 * the next, and a chunk carrying more text than a box holds is split across
 * its own duration, in proportion to where the words fall.
 */
export function captionsFromSegments(segments: TimedSegment[]): Caption[] {
  const usable = segments
    .filter((s) => s.text.trim() && s.end_ms > s.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms);

  // Merge anything too short to read into its neighbour.
  const merged: TimedSegment[] = [];
  for (const seg of usable) {
    const previous = merged[merged.length - 1];
    const tooBrief = seg.end_ms - seg.start_ms < MIN_CAPTION_MS;
    const roomLeft =
      previous && `${previous.text} ${seg.text}`.length <= MAX_CAPTION_CHARS;
    if (previous && tooBrief && roomLeft) {
      previous.text = `${previous.text} ${seg.text}`.trim();
      previous.end_ms = seg.end_ms;
    } else {
      merged.push({ ...seg, text: seg.text.trim() });
    }
  }

  const captions: Caption[] = [];
  for (const seg of merged) {
    if (seg.text.length <= MAX_CAPTION_CHARS) {
      captions.push({ text: wrapText(seg.text), start_ms: seg.start_ms, end_ms: seg.end_ms });
      continue;
    }

    // Too long for one box: split on words and share the chunk's own window,
    // so the pieces still land while those words are being said.
    const words = seg.text.split(/\s+/);
    const pieces: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= MAX_CAPTION_CHARS) {
        current = candidate;
      } else {
        pieces.push(current);
        current = word;
      }
    }
    if (current) pieces.push(current);

    const total = pieces.reduce((n, p) => n + p.length, 0) || 1;
    let cursor = seg.start_ms;
    pieces.forEach((piece, i) => {
      const share = (seg.end_ms - seg.start_ms) * (piece.length / total);
      const end = i === pieces.length - 1 ? seg.end_ms : Math.round(cursor + share);
      captions.push({ text: wrapText(piece), start_ms: Math.round(cursor), end_ms: end });
      cursor = end;
    });
  }

  return captions;
}

/**
 * Captions locked to panel windows.
 *
 * Kept for the case where only panel boundaries are known and no per-chunk
 * timing exists — it reads as a caption per image rather than as subtitles.
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

/**
 * Narrows the JSONB column into usable segments.
 *
 * The database hands this back as free-form JSON, so it is validated rather
 * than asserted: a malformed row should mean "no captions", never a crash
 * halfway through a video.
 */
export function parseSegments(value: unknown): TimedSegment[] | null {
  if (!Array.isArray(value)) return null;
  const segments = value.filter(
    (s): s is TimedSegment =>
      typeof s === "object" &&
      s !== null &&
      typeof (s as TimedSegment).start_ms === "number" &&
      typeof (s as TimedSegment).end_ms === "number" &&
      typeof (s as TimedSegment).text === "string"
  );
  return segments.length > 0 ? segments : null;
}
