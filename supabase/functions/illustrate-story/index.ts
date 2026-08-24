import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getStyle, buildPanelPrompt, DEFAULT_STYLE_ID } from "../_shared/styles.ts";
import { getImageProvider, generateWithRetry } from "../_shared/imageProviders.ts";
import {
  buildStoryboard,
  configuredSecondsPerPanel,
  planPanelCount,
  type Storyboard,
  type TranscriptSegment,
} from "../_shared/storyboard.ts";
import { realDurationMs } from "../_shared/transcribe.ts";
import { composeVideo } from "../_shared/composeVideo.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const IMAGE_BUCKET = "story_images";
const VIDEO_BUCKET = "story_videos";

/** Free allowance: one generation per user per rolling week. */
const WEEKLY_ALLOWANCE = Number(Deno.env.get("ILLUSTRATION_WEEKLY_ALLOWANCE") ?? "1");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Generated in small parallel batches: fast enough, gentle on rate limits. */
const CONCURRENCY = 3;

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

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Injected by the Supabase Deno runtime; absent when serving locally. */
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;

/** Hands work to the platform so the response can return immediately. */
function runInBackground(promise: Promise<unknown>) {
  const runtime = typeof EdgeRuntime !== "undefined" ? EdgeRuntime : undefined;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
  } else {
    promise.catch((err) => console.error("Background illustration failed:", err));
  }
}

/** Runs `worker` over every item, at most `limit` at a time, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

interface IllustratablePost {
  id: string;
  user_id: string;
  title: string;
  transcription: string;
  duration: number;
  duration_ms: number | null;
  transcription_segments: TranscriptSegment[] | null;
}

/**
 * Generates the panels, saving each one the moment it exists.
 *
 * The rows used to be written in a single batch at the very end, which meant
 * the user watched nothing at all for about a minute and then everything at
 * once. Inserting as they land lets realtime push them one by one, so the
 * story visibly draws itself while it is still being made.
 */
async function generatePanels(post: IllustratablePost, storyboard: Storyboard, styleId: string) {
  const style = getStyle(styleId);
  const provider = getImageProvider();
  // One seed for the whole story: shared randomness nudges the panels toward
  // a common look on the models that honour it.
  const storySeed = Math.floor(Math.random() * 2_147_483_647);

  return mapWithConcurrency(storyboard.scenes, CONCURRENCY, async (scene) => {
    const prompt = buildPanelPrompt(style, storyboard.cast, scene.description);

    const image = await generateWithRetry(provider, {
      prompt,
      style,
      aspectRatio: "9:16",
      seed: storySeed + scene.idx,
    });

    const ext = EXTENSIONS[image.contentType] ?? "jpg";
    const path = `${post.user_id}/${post.id}/${scene.idx}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, image.bytes, { contentType: image.contentType, upsert: true });
    if (uploadError) throw new Error(`Upload failed for panel ${scene.idx}: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);

    const row = {
      post_id: post.id,
      idx: scene.idx,
      image_url: urlData.publicUrl,
      prompt,
      caption: scene.caption,
      start_ms: scene.start_ms,
      end_ms: scene.end_ms,
      style_id: style.id,
      provider: provider.id,
      model: image.model,
      cost_usd: image.costUsd,
    };

    const { error: insertError } = await supabase
      .from("post_illustrations")
      .upsert(row, { onConflict: "post_id,idx" });
    if (insertError) throw new Error(`Could not save panel ${scene.idx}: ${insertError.message}`);

    return row;
  });
}

async function processPost(post: IllustratablePost, styleId: string) {
  try {
    const segments = post.transcription_segments ?? [];
    const totalMs = realDurationMs(post.duration, segments, post.duration_ms);

    const storyboard = await buildStoryboard({
      title: post.title,
      transcription: post.transcription,
      segments,
      durationSec: totalMs / 1000,
      panelCount: planPanelCount(totalMs / 1000, configuredSecondsPerPanel()),
    });

    const rows = await generatePanels(post, storyboard, styleId);
    const panelCost = rows.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
    console.log(`✅ ${rows.length} panels for ${post.id} — est. $${panelCost.toFixed(4)}`);

    await supabase
      .from("voice_posts")
      .update({
        illustration_status: "ready",
        illustration_cover_url: rows[0]?.image_url ?? null,
        video_status: "pending",
      })
      .eq("id", post.id);

    // The video is a bonus on top of the panels. It is also the only step that
    // depends on an external composer, so its failure must never cost the
    // panels — they are the expensive part and they are already saved.
    try {
      const { data: audio } = await supabase
        .from("voice_posts")
        .select("audio_url")
        .eq("id", post.id)
        .single();

      const composed = await composeVideo({
        panels: rows.map((r) => ({
          imageUrl: r.image_url,
          start_ms: r.start_ms,
          end_ms: r.end_ms,
        })),
        audioUrl: audio!.audio_url,
        totalMs,
      });

      // Copied into our own bucket: fal's URLs are not meant to be permanent.
      const videoResponse = await fetch(composed.videoUrl);
      const videoPath = `${post.user_id}/${post.id}.mp4`;
      const { error: videoUploadError } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(videoPath, new Uint8Array(await videoResponse.arrayBuffer()), {
          contentType: "video/mp4",
          upsert: true,
        });
      if (videoUploadError) throw new Error(videoUploadError.message);

      const { data: videoUrlData } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(videoPath);

      await supabase
        .from("voice_posts")
        .update({ video_url: videoUrlData.publicUrl, video_status: "ready" })
        .eq("id", post.id);

      console.log(`🎬 Video for ${post.id} — est. $${composed.costUsd.toFixed(4)}`);
    } catch (videoError) {
      console.error(`⚠️ Video composition failed for ${post.id}:`, videoError);
      await supabase.from("voice_posts").update({ video_status: "failed" }).eq("id", post.id);
    }
  } catch (err) {
    console.error(`❌ Illustration failed for post ${post.id}:`, err);
    // Any panels that did succeed stay in place; the status tells the UI to
    // offer a retry rather than pretend the story is illustrated.
    await supabase.from("voice_posts").update({ illustration_status: "failed" }).eq("id", post.id);
  }
}

/**
 * Whether this user may start a generation, and why not when they may not.
 *
 * The free allowance is one per rolling week. A credit buys one beyond that
 * and is spent immediately — nothing grants credits yet, this is where paid
 * packs will plug in once Apple's in-app purchase is wired up.
 */
async function checkAllowance(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const since = new Date(Date.now() - WEEK_MS).toISOString();

  const { data: recent, error } = await supabase
    .from("voice_posts")
    .select("illustration_generated_at")
    .eq("user_id", userId)
    .gte("illustration_generated_at", since)
    .order("illustration_generated_at", { ascending: true });

  if (error) {
    // A broken allowance check must not take the feature down.
    console.error("Allowance check failed, allowing through:", error.message);
    return { ok: true };
  }

  if ((recent?.length ?? 0) < WEEKLY_ALLOWANCE) return { ok: true };

  const { data: credit } = await supabase
    .from("illustration_credits")
    .select("credits")
    .eq("user_id", userId)
    .maybeSingle();

  if ((credit?.credits ?? 0) > 0) {
    await supabase
      .from("illustration_credits")
      .update({ credits: credit!.credits - 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    return { ok: true };
  }

  // Say when it comes back rather than just refusing.
  const oldest = recent![0].illustration_generated_at as string;
  const renewsAt = new Date(new Date(oldest).getTime() + WEEK_MS);
  const days = Math.max(1, Math.ceil((renewsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));

  return {
    ok: false,
    message:
      days === 1
        ? "Tu as déjà illustré une anecdote cette semaine. Tu pourras recommencer demain."
        : `Tu as déjà illustré une anecdote cette semaine. Tu pourras recommencer dans ${days} jours.`,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { voice_post_id, style_id, internal } = body;
    if (!voice_post_id) return json({ error: "Missing voice_post_id" }, 400);

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Not signed in" }, 401);

    // transcribe-audio chains into this function with the service role once the
    // transcription exists. That call already passed the user's own request, so
    // it is not re-checked here.
    const isInternal = internal === true && token === SUPABASE_SERVICE_ROLE_KEY;

    let callerId: string | null = null;
    if (!isInternal) {
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData?.user) return json({ error: "Not signed in" }, 401);
      callerId = userData.user.id;
    }

    const { data: post, error: postError } = await supabase
      .from("voice_posts")
      .select(
        "id, user_id, title, duration, duration_ms, transcription, transcription_segments, illustration_status"
      )
      .eq("id", voice_post_id)
      .single();

    if (postError || !post) return json({ error: "Post not found" }, 404);
    if (!isInternal && post.user_id !== callerId) {
      return json({ error: "You can only illustrate your own anecdotes" }, 403);
    }
    if (!post.transcription?.trim()) {
      return json({ error: "This anecdote has no transcription yet. Try again in a moment." }, 409);
    }

    // Idempotent: a second tap while the first run is still going is a no-op.
    if (post.illustration_status === "ready" || post.illustration_status === "pending") {
      return json({ status: post.illustration_status, voice_post_id }, 200);
    }

    const allowance = await checkAllowance(post.user_id);
    if (!allowance.ok) return json({ error: allowance.message }, 429);

    await supabase
      .from("voice_posts")
      .update({
        illustration_status: "pending",
        illustration_generated_at: new Date().toISOString(),
      })
      .eq("id", post.id);

    runInBackground(
      processPost(
        {
          id: post.id,
          user_id: post.user_id,
          title: post.title,
          transcription: post.transcription,
          duration: post.duration,
          duration_ms: post.duration_ms ?? null,
          transcription_segments: (post.transcription_segments as TranscriptSegment[] | null) ?? null,
        },
        style_id ?? DEFAULT_STYLE_ID
      )
    );

    return json({ status: "pending", voice_post_id }, 202);
  } catch (error) {
    console.error("❌ illustrate-story error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
