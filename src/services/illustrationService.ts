import { supabase } from "@/integrations/supabase/client";

export type IllustrationStatus = "none" | "pending" | "ready" | "failed";

export interface IllustrationPanel {
  id: string;
  post_id: string;
  idx: number;
  image_url: string;
  caption: string | null;
  start_ms: number;
  end_ms: number;
}

/**
 * Asks the backend to illustrate an anecdote.
 *
 * Returns as soon as the job is accepted — the panels arrive later, and the
 * caller should watch the post's illustration_status for the result.
 */
export async function requestIllustration(voicePostId: string): Promise<IllustrationStatus> {
  const { data, error } = await supabase.functions.invoke("illustrate-story", {
    body: { voice_post_id: voicePostId },
  });

  if (error) {
    // Edge Function errors carry the useful message in the response body:
    // the quota refusal and the "no transcription yet" case both arrive here.
    let message = error.message || "Illustration failed";
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    try {
      const body = await context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      /* the body was not JSON; the generic message stands */
    }
    throw new Error(message);
  }

  return (data?.status as IllustrationStatus) ?? "pending";
}

export async function fetchIllustrations(voicePostId: string): Promise<IllustrationPanel[]> {
  const { data, error } = await supabase
    .from("post_illustrations")
    .select("id, post_id, idx, image_url, caption, start_ms, end_ms")
    .eq("post_id", voicePostId)
    .order("idx", { ascending: true });

  if (error) {
    console.error("Could not load illustrations:", error.message);
    return [];
  }
  return (data ?? []) as IllustrationPanel[];
}
