/**
 * Speech to text, through whichever provider this project is configured for.
 *
 * Transcription is the foundation of everything else — no transcription means
 * no storyboard and no video — so it must not be hostage to holding one
 * particular API key. fal serves Whisper too, and a benchmark run transcribed
 * real anecdotes through it without trouble.
 */

import type { TranscriptSegment } from "./storyboard.ts";

export interface Transcription {
  text: string;
  /** Timestamped chunks. Empty when the provider returned none. */
  segments: TranscriptSegment[];
  language: string | null;
  provider: string;
}

export interface TranscribeInput {
  audioUrl: string;
  /** ISO code. Leave undefined to let the model detect it — forcing the wrong
   *  one makes Whisper mis-hear, or translate, everything it is given. */
  language?: string;
}

/** Drops chunks that carry no words or no usable window. */
function cleanSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.filter((s) => s.text.trim() && s.end_ms > s.start_ms);
}

async function transcribeWithOpenAI(
  input: TranscribeInput,
  apiKey: string
): Promise<Transcription> {
  const audioResponse = await fetch(input.audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Could not fetch audio: ${audioResponse.statusText}`);
  }
  const audioBuffer = await audioResponse.arrayBuffer();

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  // verbose_json is what carries the per-segment timestamps.
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  if (input.language) form.append("language", input.language);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper (OpenAI) failed: ${await res.text()}`);

  const json = await res.json();
  const segments = Array.isArray(json.segments)
    ? json.segments.map((s: { start?: number; end?: number; text?: string }) => ({
        start_ms: Math.round((s.start ?? 0) * 1000),
        end_ms: Math.round((s.end ?? 0) * 1000),
        text: (s.text ?? "").trim(),
      }))
    : [];

  return {
    text: (json.text ?? "").trim(),
    segments: cleanSegments(segments),
    language: json.language ?? null,
    provider: "openai",
  };
}

async function transcribeWithFal(input: TranscribeInput, apiKey: string): Promise<Transcription> {
  const body: Record<string, unknown> = {
    audio_url: input.audioUrl,
    chunk_level: "segment",
  };
  if (input.language) body.language = input.language;

  const res = await fetch("https://fal.run/fal-ai/whisper", {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Whisper (fal) failed: ${await res.text()}`);

  const json = await res.json();
  // fal reports each chunk as a [start, end] pair in seconds.
  const raw = Array.isArray(json.chunks) ? json.chunks : [];
  const segments = raw.map((c: { timestamp?: [number, number]; text?: string }) => ({
    start_ms: Math.round((c.timestamp?.[0] ?? 0) * 1000),
    end_ms: Math.round((c.timestamp?.[1] ?? 0) * 1000),
    text: (c.text ?? "").trim(),
  }));

  return {
    text: (json.text ?? "").trim(),
    segments: cleanSegments(segments),
    language: json.inferred_languages?.[0] ?? null,
    provider: "fal",
  };
}

/**
 * Transcribes through OpenAI when its key is present, fal otherwise.
 *
 * OpenAI first only because the project already held that key; either is a
 * complete answer, and the absence of both is the only fatal case.
 */
export async function transcribe(input: TranscribeInput): Promise<Transcription> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) return transcribeWithOpenAI(input, openaiKey);

  const falKey = Deno.env.get("FAL_KEY");
  if (falKey) return transcribeWithFal(input, falKey);

  throw new Error("Transcription needs either OPENAI_API_KEY or FAL_KEY.");
}

/**
 * The real length of the recording, in milliseconds.
 *
 * `voice_posts.duration` comes from a whole-second counter, so it is always a
 * little short of the audio — which truncated the last words of every video
 * built from it. The end of the last spoken chunk is a better floor, and a
 * small tail keeps the final word from being clipped by rounding.
 */
export const TAIL_PADDING_MS = 400;

export function realDurationMs(
  declaredSeconds: number,
  segments: TranscriptSegment[],
  declaredMs?: number | null
): number {
  const fromDeclared = declaredMs && declaredMs > 0 ? declaredMs : declaredSeconds * 1000;
  const lastSpoken = segments.reduce((max, s) => Math.max(max, s.end_ms), 0);
  return Math.max(fromDeclared, lastSpoken + TAIL_PADDING_MS);
}
