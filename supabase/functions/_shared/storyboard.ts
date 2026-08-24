/**
 * Turns a transcribed anecdote into a storyboard: a frozen cast sheet plus an
 * ordered list of panels, each mapped onto a slice of the audio.
 *
 * Timing is computed here rather than asked of the model. We already know the
 * exact segment boundaries from Whisper, and language models are unreliable at
 * arithmetic over timestamps — so the model only writes prose, and the code
 * owns the clock.
 */

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

export interface PanelTiming {
  start_ms: number;
  end_ms: number;
}

export interface StoryboardScene extends PanelTiming {
  idx: number;
  /** One short line of narration, shown under the panel. */
  caption: string;
  /** The visual description handed to the image model. */
  description: string;
}

export interface Storyboard {
  /** Frozen physical description of the recurring characters. */
  cast: string;
  scenes: StoryboardScene[];
}

export const MIN_PANELS = 3;
export const MAX_PANELS = 8;

/** Roughly one panel per 15 seconds of speech, clamped to a readable range. */
export function planPanelCount(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return MIN_PANELS;
  return Math.min(MAX_PANELS, Math.max(MIN_PANELS, Math.round(durationSec / 15)));
}

/**
 * Splits the audio into `count` contiguous panels.
 *
 * Cuts land on segment boundaries wherever segments are available, so panels
 * change between sentences instead of mid-word. The result always covers
 * [0, totalMs] with no gap and no overlap.
 */
export function assignTimings(
  count: number,
  segments: TranscriptSegment[] | null | undefined,
  totalMs: number
): PanelTiming[] {
  const n = Math.max(1, Math.floor(count));
  const total = Math.max(1, Math.round(totalMs));

  const usable = (segments ?? []).filter(
    (s) => Number.isFinite(s.start_ms) && Number.isFinite(s.end_ms) && s.end_ms > s.start_ms
  );

  // No usable segments: fall back to an even split.
  if (usable.length === 0) {
    return Array.from({ length: n }, (_, i) => ({
      start_ms: Math.round((total * i) / n),
      end_ms: Math.round((total * (i + 1)) / n),
    }));
  }

  // Fewer segments than panels: one per segment, then pad by even division.
  if (usable.length < n) {
    return Array.from({ length: n }, (_, i) => ({
      start_ms: Math.round((total * i) / n),
      end_ms: Math.round((total * (i + 1)) / n),
    }));
  }

  const boundaries: number[] = [0];
  for (let panel = 1; panel < n; panel++) {
    const target = (total * panel) / n;
    // Pick the segment boundary closest to where an even split would land.
    let best = usable[0].end_ms;
    let bestDistance = Infinity;
    for (const seg of usable) {
      const distance = Math.abs(seg.end_ms - target);
      if (distance < bestDistance && seg.end_ms > boundaries[panel - 1]) {
        best = seg.end_ms;
        bestDistance = distance;
      }
    }
    // Never let two panels collapse onto the same instant.
    boundaries.push(Math.max(best, boundaries[panel - 1] + 1));
  }
  boundaries.push(total);

  return Array.from({ length: n }, (_, i) => ({
    start_ms: Math.round(boundaries[i]),
    end_ms: Math.round(Math.max(boundaries[i + 1], boundaries[i] + 1)),
  }));
}

// ------------------------------------------------------------ the LLM call

const STORYBOARD_SYSTEM = `You are a comic book storyboard artist adapting short spoken anecdotes into wordless comic panels.

You will receive a transcript of someone telling a personal anecdote out loud, and a number of panels to produce.

Return:
1. "cast": one paragraph fixing the PHYSICAL APPEARANCE of every recurring character — age, build, hair, clothing, distinguishing features. Be concrete and specific; invent plausible details where the transcript is silent. This paragraph is copied verbatim into every panel prompt, so it is what keeps the characters looking like themselves. Never use proper names here; describe by role ("the narrator", "her brother").
2. "scenes": exactly the requested number of panels, in narrative order, each with:
   - "caption": one short sentence in the transcript's own language, narrating that beat.
   - "description": what is literally VISIBLE in the panel, written for an image generator. Describe setting, characters present, their posture and expression, and the single action. Refer to characters by the same role words used in the cast paragraph. No dialogue, no speech bubbles, no text, no camera jargon.

Rules:
- Illustrate what actually happens in the anecdote. Do not invent a different story.
- One clear action per panel. Prefer concrete, drawable moments over abstract ideas.
- If the anecdote has no people in it, describe objects and places instead and leave "cast" as an empty string.
- Keep every description under 60 words.`;

interface StoryboardModelOutput {
  cast: string;
  scenes: { caption: string; description: string }[];
}

const STORYBOARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cast", "scenes"],
  properties: {
    cast: { type: "string" },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["caption", "description"],
        properties: {
          caption: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
};

export interface BuildStoryboardInput {
  title: string;
  transcription: string;
  segments?: TranscriptSegment[] | null;
  durationSec: number;
  panelCount?: number;
}

/**
 * Asks the language model for the cast sheet and the panel descriptions, then
 * maps them onto the audio timeline.
 *
 * Uses the OpenAI key that already powers transcription, so illustration adds
 * no new secret to manage.
 */
export async function buildStoryboard(input: BuildStoryboardInput): Promise<Storyboard> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const model = Deno.env.get("STORYBOARD_MODEL") ?? "gpt-4.1-mini";
  const count = input.panelCount ?? planPanelCount(input.durationSec);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: STORYBOARD_SYSTEM },
        {
          role: "user",
          content: `Title: ${input.title}\nPanels to produce: ${count}\n\nTranscript:\n${input.transcription}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "storyboard", strict: true, schema: STORYBOARD_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Storyboard model failed: ${await res.text()}`);
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Storyboard model returned no content");

  let parsed: StoryboardModelOutput;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Storyboard model returned malformed JSON");
  }

  const scenes = (parsed.scenes ?? []).filter((s) => s?.description?.trim());
  if (scenes.length === 0) throw new Error("Storyboard model returned no scenes");

  // Trust the model's count only as far as it goes; time what we actually got.
  const timings = assignTimings(scenes.length, input.segments, input.durationSec * 1000);

  return {
    cast: (parsed.cast ?? "").trim(),
    scenes: scenes.map((s, i) => ({
      idx: i,
      caption: (s.caption ?? "").trim(),
      description: s.description.trim(),
      start_ms: timings[i].start_ms,
      end_ms: timings[i].end_ms,
    })),
  };
}
