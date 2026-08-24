/**
 * Measures how long a recording actually is.
 *
 * The app used to store a whole-second counter as the duration, which is
 * always a little short of the real audio — and every video built from it cut
 * the speaker's last words off. Reading the real length from the file fixes it
 * at the source.
 */

/** Recordings longer than this are certainly a bad metadata read, not audio. */
const IMPLAUSIBLE_MS = 60 * 60 * 1000;

/**
 * Duration of an audio blob in milliseconds, or null if it cannot be read.
 *
 * Chrome's MediaRecorder writes WebM without a duration header, so the element
 * reports `Infinity` until it has been forced to seek to the end. Seeking to an
 * absurd position makes the browser resolve the real duration; that dance is
 * the reason this is not a one-liner.
 */
export function measureAudioDurationMs(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    let url: string;
    try {
      url = URL.createObjectURL(blob);
    } catch {
      resolve(null);
      return;
    }

    const audio = document.createElement("audio");
    audio.preload = "metadata";

    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.ondurationchange = null;
      audio.onerror = null;
      audio.src = "";
      URL.revokeObjectURL(url);
      resolve(value);
    };

    const accept = (seconds: number) => {
      const ms = Math.round(seconds * 1000);
      finish(ms > 0 && ms < IMPLAUSIBLE_MS ? ms : null);
    };

    // Never leave a publish hanging on a file the browser will not decode.
    const timer = setTimeout(() => finish(null), 5000);

    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        accept(audio.duration);
        return;
      }
      // Infinity: force the browser to walk to the end so it works out the
      // real duration, which then arrives as a durationchange.
      audio.currentTime = 1e101;
    };

    audio.ondurationchange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) accept(audio.duration);
    };

    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

/**
 * The duration to store, in milliseconds.
 *
 * The measurement wins when it agrees roughly with the counter. A wild
 * disagreement means the metadata is wrong, not the stopwatch, so the counter
 * stands — a plainly false duration is worse than a slightly short one.
 */
export function resolveDurationMs(measuredMs: number | null, elapsedSeconds: number): number {
  const fromCounter = Math.max(0, Math.round(elapsedSeconds * 1000));
  if (measuredMs === null) return fromCounter;

  // The counter can only under-report, and never by more than a second or two.
  const plausible = measuredMs >= fromCounter - 2000 && measuredMs <= fromCounter + 5000;
  return plausible ? measuredMs : fromCounter;
}
