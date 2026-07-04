import { supabase } from "@/integrations/supabase/client";

export async function transcribeAudio(audioUrl: string, voicePostId: string): Promise<string> {
  try {
    console.log("🎤 Starting transcription for post:", voicePostId);

    const { data, error } = await supabase.functions.invoke("transcribe-audio", {
      body: { audio_url: audioUrl, voice_post_id: voicePostId },
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
