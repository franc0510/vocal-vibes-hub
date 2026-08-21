import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { getStyle, buildPanelPrompt, DEFAULT_STYLE_ID } from "../_shared/styles.ts";
import { getImageProvider, generateWithRetry } from "../_shared/imageProviders.ts";
import {
  buildStoryboard,
  planPanelCount,
  type Storyboard,
  type TranscriptSegment,
} from "../_shared/storyboard.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET = "story_images";
/**
 * Budget in panels, not in stories: panels are what we actually pay for, and
 * a story is 3 to 8 of them. 24 is roughly three full-length anecdotes a day.
 */
const DAILY_PANEL_QUOTA = Number(Deno.env.get("ILLUSTRATION_DAILY_PANEL_QUOTA") ?? "24");
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

async function generateAndStore(
  post: { id: string; user_id: string },
  storyboard: Storyboard,
  styleId: string
) {
  const style = getStyle(styleId);
  const provider = getImageProvider();
  // One seed for the whole story: shared randomness nudges the panels toward
  // a common look on the models that honour it.
  const storySeed = Math.floor(Math.random() * 2_147_483_647);

  const rows = await mapWithConcurrency(storyboard.scenes, CONCURRENCY, async (scene) => {
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
      .from(BUCKET)
      .upload(path, image.bytes, { contentType: image.contentType, upsert: true });
    if (uploadError) throw new Error(`Upload failed for panel ${scene.idx}: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return {
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
  });

  const { error: insertError } = await supabase
    .from("post_illustrations")
    .upsert(rows, { onConflict: "post_id,idx" });
  if (insertError) throw new Error(`Could not save illustrations: ${insertError.message}`);

  const totalCost = rows.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
  console.log(`✅ ${rows.length} panels for post ${post.id} — est. $${totalCost.toFixed(4)}`);

  return rows[0]?.image_url ?? null;
}

interface IllustratablePost {
  id: string;
  user_id: string;
  title: string;
  transcription: string;
  duration: number;
  transcription_segments: TranscriptSegment[] | null;
}

async function processPost(post: IllustratablePost, styleId: string) {
  try {
    const storyboard = await buildStoryboard({
      title: post.title,
      transcription: post.transcription,
      segments: post.transcription_segments,
      durationSec: post.duration,
      panelCount: planPanelCount(post.duration),
    });

    const coverUrl = await generateAndStore(post, storyboard, styleId);

    await supabase
      .from("voice_posts")
      .update({ illustration_status: "ready", illustration_cover_url: coverUrl })
      .eq("id", post.id);
  } catch (err) {
    console.error(`❌ Illustration failed for post ${post.id}:`, err);
    // Leave any panels that did succeed in place; the status tells the UI to
    // offer a retry rather than pretend the story is illustrated.
    await supabase.from("voice_posts").update({ illustration_status: "failed" }).eq("id", post.id);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Not signed in" }, 401);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Not signed in" }, 401);

    const { voice_post_id, style_id } = await req.json();
    if (!voice_post_id) return json({ error: "Missing voice_post_id" }, 400);

    const { data: post, error: postError } = await supabase
      .from("voice_posts")
      .select("id, user_id, title, duration, transcription, transcription_segments, illustration_status")
      .eq("id", voice_post_id)
      .single();

    if (postError || !post) return json({ error: "Post not found" }, 404);
    if (post.user_id !== user.id) {
      return json({ error: "You can only illustrate your own anecdotes" }, 403);
    }
    if (!post.transcription?.trim()) {
      return json({ error: "This anecdote has no transcription yet. Try again in a moment." }, 409);
    }

    // Idempotent: a second tap while the first run is still going is a no-op.
    if (post.illustration_status === "ready" || post.illustration_status === "pending") {
      return json({ status: post.illustration_status, voice_post_id }, 200);
    }

    // Quota is counted per user over a rolling 24h, in panels — the unit we pay for.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: quotaError } = await supabase
      .from("post_illustrations")
      .select("id, voice_posts!inner(user_id)", { count: "exact", head: true })
      .eq("voice_posts.user_id", user.id)
      .gte("created_at", since);

    if (quotaError) {
      // A broken quota check must not take the feature down; log and let it through.
      console.error("Quota check failed, allowing through:", quotaError.message);
    } else if ((count ?? 0) + planPanelCount(post.duration) > DAILY_PANEL_QUOTA) {
      return json(
        { error: "You have illustrated enough anecdotes for today. Try again tomorrow." },
        429
      );
    }

    await supabase.from("voice_posts").update({ illustration_status: "pending" }).eq("id", post.id);

    runInBackground(
      processPost(
        {
          id: post.id,
          user_id: post.user_id,
          title: post.title,
          transcription: post.transcription,
          duration: post.duration,
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
