/**
 * Global audio manager — guarantees that only ONE audio element is ever
 * playing at a time across the whole app (reals, search, profile, weekly,
 * comments, messages …). Any component that plays audio should route its
 * `play()` through `playExclusive()` and release on unmount/stop.
 */

let current: HTMLAudioElement | null = null;
const listeners = new Set<(audio: HTMLAudioElement | null) => void>();

/** Pause any other audio, mark this element as the active one, then play it. */
export const playExclusive = (audio: HTMLAudioElement): Promise<void> => {
  if (current && current !== audio) {
    try {
      current.pause();
    } catch {
      /* ignore */
    }
  }
  current = audio;
  listeners.forEach((l) => l(audio));
  return audio.play();
};

/** Note that this element stopped/paused; clears it if it was the active one. */
export const releaseAudio = (audio: HTMLAudioElement | null) => {
  if (audio && current === audio) {
    current = null;
    listeners.forEach((l) => l(null));
  }
};

/** Stop whatever is currently playing (used when navigating away, etc.). */
export const stopActiveAudio = () => {
  if (current) {
    try {
      current.pause();
    } catch {
      /* ignore */
    }
    current = null;
    listeners.forEach((l) => l(null));
  }
};

export const getActiveAudio = () => current;

/** Subscribe to active-audio changes (e.g. to update a mini-player UI). */
export const onActiveAudioChange = (cb: (audio: HTMLAudioElement | null) => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
