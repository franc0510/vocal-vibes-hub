// =============================================================
//  transcribe-audio — VERSION À COLLER DANS LE TABLEAU DE BORD
// =============================================================
//
//  FICHIER GÉNÉRÉ. Ne pas le modifier à la main : éditer
//  supabase/functions/_shared/transcribe.ts ou
//  supabase/functions/transcribe-audio/index.ts, puis relancer
//    npx tsx scripts/bundle-edge-function.ts
//
//  À QUOI IL SERT
//  L'éditeur du tableau de bord Supabase ne voit que le dossier de la
//  fonction, alors que le vrai index.ts importe ../_shared/transcribe.ts.
//  Ici ce module est recopié à l'intérieur : le fichier est autonome.
//
//  COMMENT S'EN SERVIR
//    Tableau de bord Supabase → Edge Functions → transcribe-audio →
//    remplacer tout le contenu par ce fichier → Deploy.
//
//  Déployer avec le CLI (supabase functions deploy transcribe-audio) reste
//  le chemin normal ; celui-ci existe pour s'en passer.
// =============================================================

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// ---------- replié depuis supabase/functions/_shared/transcribe.ts ----------

/**
 * Speech to text, through whichever provider this project is configured for.
 *
 * Transcription is the foundation of everything else — no transcription means
 * no storyboard and no video — so it must not be hostage to holding one
 * particular API key. fal serves Whisper too, and a benchmark run transcribed
 * real anecdotes through it without trouble.
 */

interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}

interface Transcription {
  text: string;
  /** Timestamped chunks. Empty when the provider returned none. */
  segments: TranscriptSegment[];
  language: string | null;
  provider: string;
}

interface TranscribeInput {
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
function audioFilePart(
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
async function transcribe(input: TranscribeInput): Promise<Transcription> {
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
const TAIL_PADDING_MS = 400;

function realDurationMs(
  declaredSeconds: number,
  segments: TranscriptSegment[],
  declaredMs?: number | null
): number {
  const fromDeclared = declaredMs && declaredMs > 0 ? declaredMs : declaredSeconds * 1000;
  const lastSpoken = segments.reduce((max, s) => Math.max(max, s.end_ms), 0);
  return Math.max(fromDeclared, lastSpoken + TAIL_PADDING_MS);
}

// ---------- fin du module replié ----------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * Hands the illustration job to its own function.
 *
 * The storyboard needs the transcription, which does not exist when the post
 * is published — so the chain is closed here, on the server, rather than by
 * the app polling and hoping.
 */
async function chainIntoIllustration(voicePostId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/illustrate-story`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ voice_post_id: voicePostId, internal: true }),
  });
  if (!res.ok) {
    console.error(`⚠️ Could not start illustration for ${voicePostId}: ${await res.text()}`);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { audio_url, voice_post_id, language, then_illustrate } = await req.json();
    if (!audio_url || !voice_post_id) {
      return json({ error: "Missing audio_url or voice_post_id" }, 400);
    }

    // Transcribing is cheap and harmless, so it stays open. Chaining into
    // illustration is neither: it spends real money and consumes the owner's
    // weekly allowance, so that path requires proving you are the owner.
    if (then_illustrate) {
      const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
      const { data: userData } = await supabase.auth.getUser(token);
      const caller = userData?.user;
      if (!caller) return json({ error: "Not signed in" }, 401);

      const { data: owner } = await supabase
        .from("voice_posts")
        .select("user_id")
        .eq("id", voice_post_id)
        .single();

      if (owner?.user_id !== caller.id) {
        return json({ error: "You can only illustrate your own anecdotes" }, 403);
      }
    }

    console.log(`🎤 Transcribing ${voice_post_id}`);

    const result = await transcribe({ audioUrl: audio_url, language });

    console.log(
      `✅ ${result.provider}: ${result.text.length} chars, ${result.segments.length} segments, lang=${result.language ?? "?"}`
    );

    const { error: updateError } = await supabase
      .from("voice_posts")
      .update({
        transcription: result.text,
        transcription_segments: result.segments.length > 0 ? result.segments : null,
      })
      .eq("id", voice_post_id);

    if (updateError) throw new Error(`Failed to update voice_post: ${updateError.message}`);

    // Either the publish-time switch asked for a video, or this call did —
    // the second case is how an anecdote published before transcription worked
    // can still be illustrated, since it has no transcription to start from.
    const { data: post } = await supabase
      .from("voice_posts")
      .select("illustration_requested, illustration_status")
      .eq("id", voice_post_id)
      .single();

    const wanted = then_illustrate || post?.illustration_requested;
    if (wanted && post?.illustration_status === "none") {
      await chainIntoIllustration(voice_post_id);
    }

    return json({
      success: true,
      transcription: result.text,
      segments: result.segments,
      language: result.language,
      provider: result.provider,
      voice_post_id,
    });
  } catch (error) {
    console.error("❌ Transcription error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unknown error during transcription" },
      500
    );
  }
});

