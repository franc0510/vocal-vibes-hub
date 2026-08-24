/**
 * Which panel of a story slideshow covers a given moment.
 *
 * Panels are contiguous and ordered, so this is a lookup rather than a search:
 * before the first panel we show the first, after the last we stay on the last,
 * so the background never goes blank while the audio is still playing.
 */
export function panelIndexAt(
  panels: { start_ms: number; end_ms: number }[],
  ms: number
): number {
  if (panels.length === 0) return -1;
  if (ms <= panels[0].start_ms) return 0;
  for (let i = 0; i < panels.length; i++) {
    if (ms >= panels[i].start_ms && ms < panels[i].end_ms) return i;
  }
  return panels.length - 1;
}
