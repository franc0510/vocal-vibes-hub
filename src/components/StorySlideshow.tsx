import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { IllustrationPanel } from "@/services/illustrationService";
import { panelIndexAt } from "@/lib/slideshow";

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

interface StorySlideshowProps {
  panels: IllustrationPanel[];
  /** Current audio position in milliseconds. */
  currentMs: number;
  className?: string;
  /** Rendered above the image — usually the readability gradient. */
  overlay?: React.ReactNode;
}

const StorySlideshow = ({ panels, currentMs, className = "", overlay }: StorySlideshowProps) => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

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

  if (!panel) return null;

  const span = Math.max(1, panel.end_ms - panel.start_ms);
  const through = Math.min(1, Math.max(0, (currentMs - panel.start_ms) / span));

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
      {overlay}
    </div>
  );
};

export default StorySlideshow;
