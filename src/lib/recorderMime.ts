/**
 * Picking a recording format the playback side can actually open.
 *
 * iOS has no WebM decoder. A recording labelled `audio/webm` will not play
 * there — and the label alone is enough: Safari trusts the stored file's
 * content type and refuses it before looking at the bytes. So the format is
 * chosen from what the recorder supports, MP4 and AAC first, and whatever the
 * recorder actually produced is what the blob and the upload are labelled.
 *
 * Anecdotes did this; voice comments did not, and hard-coded `audio/webm` on
 * both the blob and the upload regardless of what had been recorded. On iOS
 * that stored an MP4 wearing a WebM label, which nothing could play.
 */

/** Preferred first: the two formats every target can decode. */
export const RECORDER_MIME_TYPES = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
];

/**
 * The best format this browser can record.
 *
 * Returns "" when none is advertised, which is not a failure: passing no
 * options lets the browser choose, and on iOS that means MP4.
 */
export function supportedRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of RECORDER_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/**
 * The type to label a finished recording with.
 *
 * `recorder.mimeType` is what was really produced, which is the only thing
 * worth trusting — it can differ from what was asked for. The fallback is MP4
 * rather than WebM because a wrong guess there is the one that cannot be
 * played back on iOS.
 */
export function recordedMime(recorderMimeType?: string | null): string {
  return recorderMimeType?.trim() || "audio/mp4";
}

/** File extension matching a recording's type, for the storage object name. */
export function extensionFor(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "m4a";
}
