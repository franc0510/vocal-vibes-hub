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

/**
 * Les formats que l'API de transcription d'OpenAI accepte, tels qu'elle les
 * énumère quand elle refuse un fichier.
 */
const OPENAI_AUDIO_FORMATS = [
  "flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm",
];

const TYPE_BY_EXTENSION: Record<string, string> = {
  flac: "audio/flac",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  mp4: "audio/mp4",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

/**
 * Le chemin inverse, déclaré plutôt que déduit.
 *
 * Plusieurs extensions partagent un même type — `oga` et `ogg`, `m4a` et
 * `mp4` — si bien qu'inverser la table ci-dessus rendrait la première venue,
 * donc l'ordre d'écriture des clés. Ce qu'on choisit ici est délibéré.
 */
const EXTENSION_BY_TYPE: Record<string, string> = {
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/aac": "m4a",
};

/**
 * Sous quel nom et quel type présenter l'enregistrement à Whisper.
 *
 * LE BUG QUE CECI RÈGLE, et il suffisait à tout arrêter.
 *
 * Le fichier était envoyé en dur comme `audio.mp3`, type `audio/mpeg` — quoi
 * qu'il fût réellement. Or VocMe n'a jamais produit un seul MP3 : iOS
 * enregistre en `audio/mp4`, les navigateurs en WebM. OpenAI décide du format
 * par le NOM et le TYPE de la partie envoyée, pas par les octets ; recevant du
 * MP4 déguisé en MP3, elle répond 400 « Invalid file format » et rien n'est
 * jamais transcrit.
 *
 * Le défaut restait invisible tant que le projet ne tenait que `FAL_KEY` :
 * fal reçoit une URL et va chercher le fichier lui-même, sans qu'on ait à le
 * nommer. Le jour où `OPENAI_API_KEY` a été posée, `transcribe()` a basculé
 * sur ce chemin-ci — et la transcription s'est arrêtée pour toute anecdote
 * publiée depuis.
 *
 * On lit donc l'extension réelle de l'URL, et l'en-tête du fichier téléchargé
 * quand l'URL ne dit rien.
 */
export function audioFilePart(
  audioUrl: string,
  contentType?: string | null
): { name: string; type: string } {
  // L'URL de Supabase Storage peut porter une requête (`?token=…`).
  const path = (audioUrl || "").split(/[?#]/)[0];
  // Le DERNIER SEGMENT, et non l'URL entière : un nom d'hôte contient des
  // points, et découper l'adresse complète prendrait « co/storage/audio/file »
  // pour une extension.
  const file = path.split("/").pop() ?? "";
  const found = file.includes(".") ? (file.split(".").pop() ?? "").toLowerCase() : "";

  // L'AAC brut ne figure pas dans la liste d'OpenAI, alors qu'il s'agit du
  // même flux que ce qu'un conteneur MP4 transporte : le nommer .m4a le fait
  // accepter, au lieu d'être rejeté sur son seul suffixe.
  const normalized = found === "aac" ? "m4a" : found;

  const fromHeader = (contentType ?? "").split(";")[0].trim().toLowerCase();
  const headerExt = EXTENSION_BY_TYPE[fromHeader];

  // Dernier recours : le format qu'iOS produit, et sur lequel le enregistreur
  // du client se rabat déjà. Surtout pas MP3, que rien ici ne fabrique.
  const ext = OPENAI_AUDIO_FORMATS.includes(normalized)
    ? normalized
    : headerExt ?? "m4a";

  return { name: `audio.${ext}`, type: TYPE_BY_EXTENSION[ext] ?? "audio/mp4" };
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

  // Le fichier tel qu'il est, et non déguisé en MP3 : voir `audioFilePart`.
  const part = audioFilePart(input.audioUrl, audioResponse.headers.get("content-type"));

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: part.type }), part.name);
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
