/**
 * Assembles the story panels and the original voice into an MP4.
 *
 * Supabase Edge Functions cannot run ffmpeg, so fal does it: its ffmpeg API
 * takes tracks of timestamped keyframes and returns a finished file, for about
 * a cent a minute — nothing against the cost of the panels themselves.
 */

export interface VideoPanelInput {
  imageUrl: string;
  start_ms: number;
  end_ms: number;
}

export interface ComposeInput {
  panels: VideoPanelInput[];
  audioUrl: string;
  /** Real length of the recording. The last panel is stretched to reach it. */
  totalMs: number;
}

export interface ComposeResult {
  videoUrl: string;
  thumbnailUrl: string | null;
  costUsd: number;
}

/** fal bills composition by the second of output. */
const COST_PER_SECOND_USD = 0.0002;

/**
 * Builds the track list.
 *
 * Exported because the timing arithmetic is the part worth pinning in a test:
 * the panels must tile the whole recording with no gap, and the last one must
 * reach the end of the audio rather than stopping at its nominal window —
 * that gap is what cut the closing words off every video.
 */
export function buildTracks(input: ComposeInput) {
  if (input.panels.length === 0) throw new Error("Aucune planche à assembler");

  const ordered = [...input.panels].sort((a, b) => a.start_ms - b.start_ms);
  const total = Math.max(input.totalMs, ordered[ordered.length - 1].end_ms);

  const keyframes = ordered.map((panel, i) => {
    const isLast = i === ordered.length - 1;
    const start = Math.max(0, Math.round(panel.start_ms));
    // Each panel runs until the next one starts; the last runs to the end of
    // the audio, however far past its own window that is.
    const end = isLast ? total : Math.round(ordered[i + 1].start_ms);
    return {
      url: panel.imageUrl,
      timestamp: start,
      duration: Math.max(200, end - start),
    };
  });

  return [
    { id: "panels", type: "video", keyframes },
    {
      id: "voice",
      type: "audio",
      keyframes: [{ url: input.audioUrl, timestamp: 0, duration: total }],
    },
  ];
}

/**
 * Composes the video through fal.
 *
 * Callers must treat a failure here as non-fatal: the panels are the expensive
 * part and they already exist, so a story without its MP4 is still a story.
 */
export async function composeVideo(input: ComposeInput): Promise<ComposeResult> {
  const apiKey = Deno.env.get("FAL_KEY");
  if (!apiKey) throw new Error("FAL_KEY manquant : impossible d'assembler la vidéo.");

  const res = await fetch("https://fal.run/fal-ai/ffmpeg-api/compose", {
    method: "POST",
    headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tracks: buildTracks(input) }),
  });

  if (!res.ok) {
    throw new Error(`Composition vidéo échouée (${res.status}) : ${await res.text()}`);
  }

  const json = await res.json();
  const videoUrl = json?.video_url;
  if (!videoUrl) throw new Error("La composition n'a renvoyé aucune vidéo.");

  return {
    videoUrl,
    thumbnailUrl: json?.thumbnail_url ?? null,
    costUsd: (input.totalMs / 1000) * COST_PER_SECOND_USD,
  };
}
