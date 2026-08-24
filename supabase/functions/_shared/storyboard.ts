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

/** Produces the storyboard JSON from a system and a user message. */
type LlmCompleter = (system: string, user: string) => Promise<string>;

/** OpenAI, with a strict schema so the shape is guaranteed rather than hoped for. */
function openaiCompleter(apiKey: string): LlmCompleter {
  const model = Deno.env.get("STORYBOARD_MODEL") ?? "gpt-4.1-mini";
  return async (system, user) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "storyboard", strict: true, schema: STORYBOARD_SCHEMA },
        },
      }),
    });
    if (!res.ok) throw new Error(`Storyboard model failed: ${await res.text()}`);
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Storyboard model returned no content");
    return raw;
  };
}

/**
 * fal, so a project holding only FAL_KEY can still build storyboards.
 *
 * There is no schema enforcement here, so the shape is requested in the prompt
 * and the fences a chat model likes to add are stripped on the way out.
 */
/**
 * Model ids to try on any-llm, in order.
 *
 * Which ids an account can actually reach varies, and a wrong one comes back
 * as a plain 404 — so this walks the list rather than betting on one name.
 * Set STORYBOARD_FAL_MODEL to pin a single id and skip the search.
 */
const FAL_LLM_CANDIDATES = [
  "google/gemini-2.5-flash",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-sonnet",
  "meta-llama/llama-3.1-8b-instruct",
];

function falCompleter(apiKey: string): LlmCompleter {
  const pinned = Deno.env.get("STORYBOARD_FAL_MODEL");
  const candidates = pinned ? [pinned] : FAL_LLM_CANDIDATES;

  return async (system, user) => {
    const failures: string[] = [];

    for (const model of candidates) {
      const res = await fetch("https://fal.run/fal-ai/any-llm", {
        method: "POST",
        headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          system_prompt: `${system}\n\nReply with JSON only, matching exactly: {"cast": string, "scenes": [{"caption": string, "description": string}]}. No prose, no code fences.`,
          prompt: user,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const raw = json?.output ?? json?.response ?? json?.text;
        if (typeof raw === "string" && raw.trim()) return raw;
        failures.push(`${model}: réponse vide`);
        continue;
      }

      const body = await res.text();
      failures.push(`${model}: ${res.status}`);
      // A 404 means "not this id, try the next"; anything else is a real
      // problem — a bad key or a rate limit — and retrying other ids only
      // multiplies the same failure.
      if (res.status !== 404) {
        throw new Error(`Storyboard via fal a échoué (${model}, ${res.status}) : ${body}`);
      }
    }

    throw new Error(
      "Aucun modèle de storyboard disponible sur fal.\n" +
        `Essayés : ${failures.join(", ")}.\n` +
        "Choisis-en un accessible à ton compte sur fal.ai/models/fal-ai/any-llm " +
        "et pose-le dans le secret STORYBOARD_FAL_MODEL."
    );
  };
}

/**
 * Picks whichever provider this environment is configured for.
 *
 * OpenAI first because its schema enforcement is stricter, but fal alone is
 * enough — illustration must not be blocked on holding two API keys.
 */
export function pickCompleter(): LlmCompleter {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) return openaiCompleter(openaiKey);

  const falKey = Deno.env.get("FAL_KEY");
  if (falKey) return falCompleter(falKey);

  throw new Error("Storyboards need either OPENAI_API_KEY or FAL_KEY.");
}

/** Chat models wrap JSON in fences even when told not to. */
function parseStoryboardJson(raw: string): StoryboardModelOutput {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    // Last resort: pull the outermost object out of any surrounding prose.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("Storyboard model returned malformed JSON");
  }
}

/**
 * Asks the language model for the cast sheet and the panel descriptions, then
 * maps them onto the audio timeline.
 */
export async function buildStoryboard(input: BuildStoryboardInput): Promise<Storyboard> {
  const complete = pickCompleter();
  const count = input.panelCount ?? planPanelCount(input.durationSec);

  const raw = await complete(
    STORYBOARD_SYSTEM,
    `Title: ${input.title}\nPanels to produce: ${count}\n\nTranscript:\n${input.transcription}`
  );

  const parsed = parseStoryboardJson(raw);

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
