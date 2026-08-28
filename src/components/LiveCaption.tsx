import { useMemo } from "react";
import { captionsFromSegments, type TimedSegment } from "@/lib/captions";

interface LiveCaptionProps {
  /** Timestamped speech. Nothing is drawn without it. */
  segments?: TimedSegment[] | null;
  /** Current audio position in milliseconds. */
  currentMs: number;
}

/**
 * The sentence being spoken, and only that one.
 *
 * It used to live inside StorySlideshow, so only illustrated anecdotes had it
 * while the rest got the whole transcription printed at once. The behaviour was
 * never tied to having pictures — it only needs timestamps — so it moved out
 * here and both kinds of anecdote share it.
 *
 * Drawn live rather than burnt into anything: the text stays sharp at any size,
 * and it follows scrubbing, pausing and speed changes for free.
 */
const LiveCaption = ({ segments, currentMs }: LiveCaptionProps) => {
  const captions = useMemo(
    () => (segments?.length ? captionsFromSegments(segments) : []),
    [segments]
  );
  const caption = useMemo(
    () => captions.find((c) => currentMs >= c.start_ms && currentMs < c.end_ms),
    [captions, currentMs]
  );

  if (!caption?.text) return null;

  return (
    <div
      // Anchored to the edge rather than to a percentage of the viewport: the
      // strip below it has a fixed height, the screen does not.
      className="absolute inset-x-0 flex justify-center px-6 pointer-events-none z-10"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 168px)" }}
    >
      <p className="max-w-[90%] whitespace-pre-line text-center text-[15px] font-medium leading-snug text-white bg-[#17151A]/70 backdrop-blur-sm px-4 py-2.5 rounded-lg">
        {caption.text}
      </p>
    </div>
  );
};

export default LiveCaption;
