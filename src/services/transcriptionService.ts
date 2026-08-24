import { supabase } from "@/integrations/supabase/client";

/**
 * Transcribes a post's audio. Leave `language` undefined to let Whisper
 * detect it — pass an ISO code only when the language is known for certain.
 */
export async function transcribeAudio(
  audioUrl: string,
  voicePostId: string,
  language?: string
): Promise<string> {
  try {
    console.log("🎤 Starting transcription for post:", voicePostId);

    const { data, error } = await supabase.functions.invoke("transcribe-audio", {
      body: { audio_url: audioUrl, voice_post_id: voicePostId, language },
    });

    if (error) {
      throw new Error(error.message || "Transcription failed");
    }

    console.log("✅ Transcription successful:", data?.transcription?.substring(0, 50));
    return data?.transcription || "";
  } catch (err: any) {
    console.error("❌ Transcription error:", err);
    throw err;
  }
}
