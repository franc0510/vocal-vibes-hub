import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { IllustrationPanel } from "@/services/illustrationService";
import { panelIndexAt } from "@/lib/slideshow";
import type { TimedSegment } from "@/lib/captions";
import LiveCaption from "./LiveCaption";

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
  // A video that will not load must not leave a blank screen where a story was.
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The MP4 carries its own audio track, but the post is already playing the
  // recording through its own element — which owns seeking, speed and the
  // waveform. So the video runs muted and is nudged back into step with it.
  useEffect(() => {
    setVideoFailed(false);
  }, [videoUrl]);

  // Play and pause follow the recording; they must not be re-issued on every
  // frame. This effect used to depend on currentMs, so it called play() around
  // sixty times a second — and iOS aborts a play() whose predecessor is still
  // pending, which is one of the two reasons the picture froze on its poster.
  const playPendingRef = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    if (isPlaying && video.paused && !playPendingRef.current) {
      playPendingRef.current = true;
      video.play().catch(() => { /* refused; the panels carry the story */ })
        .finally(() => { playPendingRef.current = false; });
    }
    if (!isPlaying && !video.paused) video.pause();
  }, [isPlaying, videoUrl]);

  // Seeking is separate, and only when the video has actually drifted. Writing
  // currentTime every frame — the second reason — restarts the seek before the
  // previous one finishes, so playback never gets going.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl || video.seeking) return;
    if (Math.abs(video.currentTime * 1000 - currentMs) > SYNC_TOLERANCE_MS) {
      video.currentTime = currentMs / 1000;
    }
  }, [currentMs, videoUrl]);

  const index = useMemo(() => panelIndexAt(panels, currentMs), [panels, currentMs]);
  const panel = index >= 0 ? panels[index] : undefined;

  // Keep the next panel warm so the crossfade never lands on a blank frame.
  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const next = panels[index + 1];
    if (!next || preloadedRef.current.has(next.image_url)) return;
    preloadedRef.current.add(next.image_url);
    const img = new Image();
    img.src = next.image_url;
  }, [panels, index]);

  /**
   * The panels win whenever they exist.
   *
   * In the app they are the better rendering: plain images driven by the audio
   * position, so they pan, cross-fade and scrub identically on every platform,
   * and the captions stay live text rather than pixels. The MP4 brought nothing
   * here that the panels do not — only a video element that can refuse to start
   * and leave a frozen poster over a story that was working underneath.
   *
   * The file still matters: it is what leaves the app when an anecdote is
   * shared. It is played here only when there are no panels to play instead.
   */
  const showVideo = Boolean(videoUrl) && !videoFailed && panels.length === 0;
  if (!showVideo && !panel) return null;

  const span = panel ? Math.max(1, panel.end_ms - panel.start_ms) : 1;
  const through = panel
    ? Math.min(1, Math.max(0, (currentMs - panel.start_ms) / span))
    : 0;

  const [dirX, dirY] = PAN_DIRECTIONS[Math.max(0, index) % PAN_DIRECTIONS.length];
  // Driven by audio position rather than a self-running animation, so the
  // movement pauses, resumes and scrubs exactly with the voice. Skipped under
  // the video, where nobody would see it.
  const transform =
    reduceMotion || showVideo
      ? undefined
      : `scale(${1 + ZOOM_RANGE * through}) translate(${dirX * PAN_PERCENT * through}%, ${dirY * PAN_PERCENT * through}%)`;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/*
        The panels are the floor, the video the finish. An iOS <video> paints
        nothing until it has decoded a frame, so playing it alone left the story
        as a white rectangle for the first seconds — and forever if the file
        never loaded. Drawing the panel underneath means there is always a
        picture, and a video that fails simply reveals the slideshow.
      */}
      {panel && (
        <AnimatePresence initial={false}>
          <motion.img
            key={panel.id}
            src={panel.image_url}
            alt={panel.caption ?? ""}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.6, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform, willChange: "transform, opacity" }}
            draggable={false}
          />
        </AnimatePresence>
      )}

      {showVideo && (
        <video
          ref={videoRef}
          src={videoUrl!}
          muted
          playsInline
          preload="auto"
          onError={() => setVideoFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {overlay}
      <LiveCaption segments={segments} currentMs={currentMs} />
    </div>
  );
};

export default StorySlideshow;
