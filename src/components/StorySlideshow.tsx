import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { IllustrationPanel } from "@/services/illustrationService";
import { panelIndexAt } from "@/lib/slideshow";
import { captionsFromSegments, type TimedSegment } from "@/lib/captions";

/** Alternating pan directions, so consecutive panels don't drift the same way. */
const PAN_DIRECTIONS: [number, number][] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, -1],
  [0, 1],
];

const ZOOM_RANGE = 0.09;
const PAN_PERCENT = 2.4;
/** Beyond this the video is visibly out of step and worth a correcting seek. */
const SYNC_TOLERANCE_MS = 250;

interface StorySlideshowProps {
  panels: IllustrationPanel[];
  /** Current audio position in milliseconds. */
  currentMs: number;
  /** The assembled MP4. When present it replaces the panel-by-panel playback. */
  videoUrl?: string | null;
  /** Whether the post's audio is playing, so the video can follow it. */
  isPlaying?: boolean;
  /** Timestamped speech, for the caption overlay. */
  segments?: TimedSegment[] | null;
  className?: string;
  /** Rendered above the image — usually the readability gradient. */
  overlay?: React.ReactNode;
}

const StorySlideshow = ({
  panels,
  currentMs,
  videoUrl,
  isPlaying = false,
  segments,
  className = "",
  overlay,
}: StorySlideshowProps) => {
  const [reduceMotion, setReduceMotion] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  /**
   * The captions are drawn here rather than burned into the file: live text
   * stays sharp at any size, and the same MP4 serves every language of caption
   * we might add later.
   */
  const captions = useMemo(
    () => (segments?.length ? captionsFromSegments(segments) : []),
    [segments]
  );
  const caption = useMemo(
    () => captions.find((c) => currentMs >= c.start_ms && currentMs < c.end_ms),
    [captions, currentMs]
  );

  // The MP4 carries its own audio track, but the post is already playing the
  // recording through its own element — which owns seeking, speed and the
  // waveform. So the video runs muted and is nudged back into step with it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const drift = Math.abs(video.currentTime * 1000 - currentMs);
    if (drift > SYNC_TOLERANCE_MS) video.currentTime = currentMs / 1000;

    if (isPlaying && video.paused) video.play().catch(() => { /* autoplay refused */ });
    if (!isPlaying && !video.paused) video.pause();
  }, [currentMs, isPlaying, videoUrl]);

  const index = useMemo(() => panelIndexAt(panels, currentMs), [panels, currentMs]);
  const panel = index >= 0 ? panels[index] : undefined;

  // Keep the next panel warm so the crossfade never lands on a blank frame.
  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (videoUrl) return;
    const next = panels[index + 1];
    if (!next || preloadedRef.current.has(next.image_url)) return;
    preloadedRef.current.add(next.image_url);
    const img = new Image();
    img.src = next.image_url;
  }, [panels, index, videoUrl]);

  if (!videoUrl && !panel) return null;

  const captionBox = caption?.text ? (
    <div className="absolute inset-x-0 bottom-[22%] flex justify-center px-6 pointer-events-none">
      <p className="max-w-[90%] whitespace-pre-line text-center text-[15px] font-medium leading-snug text-white bg-[#17151A]/70 backdrop-blur-sm px-4 py-2.5 rounded-lg">
        {caption.text}
      </p>
    </div>
  ) : null;

  if (videoUrl) {
    return (
      <div className={`absolute inset-0 overflow-hidden ${className}`}>
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {overlay}
        {captionBox}
      </div>
    );
  }

  const span = Math.max(1, panel!.end_ms - panel!.start_ms);
  const through = Math.min(1, Math.max(0, (currentMs - panel!.start_ms) / span));

  const [dirX, dirY] = PAN_DIRECTIONS[index % PAN_DIRECTIONS.length];
  // Driven by audio position rather than a self-running animation, so the
  // movement pauses, resumes and scrubs exactly with the voice.
  const transform = reduceMotion
    ? undefined
    : `scale(${1 + ZOOM_RANGE * through}) translate(${dirX * PAN_PERCENT * through}%, ${dirY * PAN_PERCENT * through}%)`;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <AnimatePresence initial={false}>
        <motion.img
          key={panel!.id}
          src={panel!.image_url}
          alt={panel!.caption ?? ""}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.15 : 0.6, ease: "easeInOut" }}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform, willChange: "transform, opacity" }}
          draggable={false}
        />
      </AnimatePresence>
      {overlay}
      {captionBox}
    </div>
  );
};

export default StorySlideshow;
