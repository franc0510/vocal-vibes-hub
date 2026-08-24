import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const { audio_url, voice_post_id, language } = await req.json();

    if (!audio_url || !voice_post_id) {
      return new Response(
        JSON.stringify({ error: "Missing audio_url or voice_post_id" }),
        { status: 400 }
      );
    }

    console.log(`🎤 Transcribing audio for post ${voice_post_id}: ${audio_url}`);

    // Fetch audio file
    const audioResponse = await fetch(audio_url);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
    }

    const audioBuffer = await audioResponse.arrayBuffer();

    // Create FormData for Whisper API
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: "audio/mpeg" }), "audio.mp3");
    formData.append("model", "whisper-1");
    // verbose_json gives us per-segment timestamps, which the illustration
    // slideshow needs to know which image belongs to which moment.
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");
    // Only constrain the language when the caller knows it. Forcing a value
    // here makes Whisper mis-hear (or translate) everything else.
    if (typeof language === "string" && language.length > 0) {
      formData.append("language", language);
    }

    // Call OpenAI Whisper API
    const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      throw new Error(`Whisper API error: ${error}`);
    }

    const transcriptionData = await whisperResponse.json();
    const transcriptionText = transcriptionData.text || "";

    // Keep only what the slideshow needs, so the JSONB column stays small.
    interface WhisperSegment { start?: number; end?: number; text?: string }
    const segments = Array.isArray(transcriptionData.segments)
      ? (transcriptionData.segments as WhisperSegment[]).map((s) => ({
          start_ms: Math.round((s.start ?? 0) * 1000),
          end_ms: Math.round((s.end ?? 0) * 1000),
          text: (s.text ?? "").trim(),
        }))
      : null;

    console.log(
      `✅ Transcription complete (${transcriptionData.language ?? "?"}, ${segments?.length ?? 0} segments): "${transcriptionText.substring(0, 50)}..."`
    );

    // Update voice_posts with transcription
    const { error: updateError } = await supabase
      .from("voice_posts")
      .update({ transcription: transcriptionText, transcription_segments: segments })
      .eq("id", voice_post_id);

    if (updateError) {
      throw new Error(`Failed to update voice_post: ${updateError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        transcription: transcriptionText,
        segments,
        language: transcriptionData.language ?? null,
        voice_post_id,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("❌ Transcription error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error during transcription",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
