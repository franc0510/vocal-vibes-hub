import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { IllustrationPanel } from "@/services/illustrationService";
import { panelIndexAt } from "@/lib/slideshow";
import type { TimedSegment } from "@/lib/captions";
import LiveCaption from "./LiveCaption";

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
  /**
   * Whether this anecdote is the one on screen.
   *
   * The feed keeps several posts mounted at once for smooth scrolling, so all
   * of them used to fetch every panel — five stories of a dozen images each,
   * competing for the connection the visible one needed. An inactive anecdote
   * now shows its first panel and nothing more.
   */
  isActive?: boolean;
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
  isActive = true,
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

  /**
   * Panels that have finished decoding, by URL.
   *
   * Nothing is shown before it is in here. A panel drawn while still
   * downloading is a white rectangle, which is what the reader saw whenever
   * the connection lagged behind the voice.
   */
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  const markReady = (url: string) =>
    setReady((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));

  // Warm several panels ahead rather than one. One panel of lead time is about
  // four seconds — less than a large image needs on a phone connection.
  const PRELOAD_AHEAD = 3;
  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isActive) return;
    for (let i = Math.max(0, index); i <= index + PRELOAD_AHEAD; i++) {
      const p = panels[i];
      if (!p || preloadedRef.current.has(p.image_url)) continue;
      preloadedRef.current.add(p.image_url);
      const img = new Image();
      img.onload = () => markReady(p.image_url);
      img.src = p.image_url;
      if (img.complete) markReady(p.image_url);
    }
  }, [panels, index, isActive]);

  /**
   * The panel actually painted: the target once it has decoded, otherwise the
   * last one that had. Holding the previous picture is always better than
   * flashing white on the way to the next.
   */
  const shownRef = useRef<IllustrationPanel | null>(null);
  if (panel && ready.has(panel.image_url)) shownRef.current = panel;
  const shown = (panel && ready.has(panel.image_url) ? panel : shownRef.current) ?? panel;

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
  const showVideo = Boolean(videoUrl) && !videoFailed && panels.length === 0 && isActive;
  if (!showVideo && !panel) return null;

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      {/*
        The panels are the floor, the video the finish. An iOS <video> paints
        nothing until it has decoded a frame, so playing it alone left the story
        as a white rectangle for the first seconds — and forever if the file
        never loaded. Drawing the panel underneath means there is always a
        picture, and a video that fails simply reveals the slideshow.
      */}
      {shown && (
        <AnimatePresence initial={false}>
          <motion.img
            key={shown.id}
            src={shown.image_url}
            alt={shown.caption ?? ""}
            initial={{ opacity: 0 }}
            // Held at zero until the bytes are in: fading in a picture that is
            // still downloading is how a half-drawn panel reaches the screen.
            animate={{ opacity: ready.has(shown.image_url) ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.15 : 0.6, ease: "easeInOut" }}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ willChange: "opacity" }}
            draggable={false}
            onLoad={() => markReady(shown.image_url)}
            // Marks the very first panel ready when it comes from the browser
            // cache, where no load event fires.
            ref={(el) => { if (el?.complete) markReady(shown.image_url); }}
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
