import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { transcribe } from "../_shared/transcribe.ts";

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
