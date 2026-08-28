import { describe, it, expect, afterEach, vi } from "vitest";
import {
  supportedRecorderMime,
  recordedMime,
  extensionFor,
  RECORDER_MIME_TYPES,
} from "./recorderMime";

/**
 * iOS has no WebM decoder, and it refuses a file on its stored content type
 * before it ever looks at the bytes. So the label matters as much as the
 * recording: an MP4 stored as `audio/webm` — which is exactly what voice
 * comments used to upload — is unplayable on iPhone.
 */
describe("supportedRecorderMime", () => {
  const original = globalThis.MediaRecorder;
  afterEach(() => {
    globalThis.MediaRecorder = original;
  });

  const withSupport = (supported: string[]) => {
    globalThis.MediaRecorder = {
      isTypeSupported: (t: string) => supported.includes(t),
    } as unknown as typeof MediaRecorder;
  };

  it("préfère MP4 quand tout est possible", () => {
    withSupport(RECORDER_MIME_TYPES);
    expect(supportedRecorderMime()).toBe("audio/mp4");
  });

  it("retombe sur WebM seulement si rien d'autre n'existe", () => {
    withSupport(["audio/webm"]);
    expect(supportedRecorderMime()).toBe("audio/webm");
  });

  it("rend une chaîne vide plutôt que d'inventer un format", () => {
    // Empty is not a failure: no options means the browser chooses, and on
    // iOS that is MP4. Naming a format it refuses would be worse.
    withSupport([]);
    expect(supportedRecorderMime()).toBe("");
  });

  it("survit à un environnement sans MediaRecorder", () => {
    // @ts-expect-error — deleting a global is the point of the test.
    delete globalThis.MediaRecorder;
    expect(() => supportedRecorderMime()).not.toThrow();
    expect(supportedRecorderMime()).toBe("");
  });
});

describe("recordedMime", () => {
  it("garde ce que l'enregistreur a réellement produit, codec compris", () => {
    // The full string is a valid content type, and trimming it back to the
    // family would discard information the player can use.
    expect(recordedMime("audio/mp4;codecs=mp4a.40.2")).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(recordedMime("audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
  });

  it("retombe sur MP4, jamais sur WebM — le mauvais pari est illisible sur iOS", () => {
    expect(recordedMime(undefined)).toBe("audio/mp4");
    expect(recordedMime(null)).toBe("audio/mp4");
    expect(recordedMime("   ")).toBe("audio/mp4");
  });
});

describe("extensionFor", () => {
  it("donne une extension cohérente avec le type", () => {
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/aac")).toBe("m4a");
    expect(extensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionFor("audio/ogg")).toBe("ogg");
  });

  it("ne rend pas .webm pour un type inconnu", () => {
    expect(extensionFor("audio/exotique")).toBe("m4a");
  });
});

// mp4 must win over the webm variants that also appear in the list.
it("ordonne les formats du plus lisible au moins lisible", () => {
  expect(RECORDER_MIME_TYPES.indexOf("audio/mp4")).toBeLessThan(
    RECORDER_MIME_TYPES.indexOf("audio/webm")
  );
});
