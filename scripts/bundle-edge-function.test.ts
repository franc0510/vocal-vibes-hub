import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { bundle, buildFromDisk, SOURCES } from "./bundle-edge-function";

/**
 * Le fichier à coller dans le tableau de bord doit dire la même chose que les
 * sources.
 *
 * Sinon il devient un piège : on corrige `_shared/transcribe.ts`, on oublie de
 * régénérer, et quelqu'un déploie depuis le tableau de bord une version
 * périmée — sans la moindre erreur, puisque le fichier reste valide. C'est
 * exactement la forme de panne silencieuse qui a fait perdre la transcription.
 */

describe("le fichier à coller dans le tableau de bord", () => {
  it("correspond à ses sources", () => {
    const committed = readFileSync(SOURCES.bundle, "utf8");
    expect(committed).toBe(buildFromDisk());
  });

  it("ne garde aucun import relatif — le tableau de bord ne les résout pas", () => {
    expect(readFileSync(SOURCES.bundle, "utf8")).not.toMatch(/from "\.\.?\//);
  });

  it("emporte la correction du format audio", () => {
    const committed = readFileSync(SOURCES.bundle, "utf8");
    expect(committed).toContain("audioFilePart");
    // La régression d'origine : le fichier annoncé en dur comme un MP3.
    expect(committed).not.toContain('"audio.mp3"');
  });
});

describe("le repliage", () => {
  const shared = `import type { TranscriptSegment } from "./storyboard.ts";

export interface Transcription { text: string }
export async function transcribe(): Promise<void> {}
`;
  const entry = `import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { transcribe } from "../_shared/transcribe.ts";

serve(() => new Response("ok"));
`;

  const out = bundle(shared, entry);

  it("remplace le type importé par sa définition", () => {
    expect(out).toContain("interface TranscriptSegment {");
    expect(out).not.toContain('from "./storyboard.ts"');
  });

  it("retire l'import du module partagé, et garde son contenu", () => {
    expect(out).not.toContain('from "../_shared/transcribe.ts"');
    expect(out).toContain("async function transcribe()");
  });

  /** Deno exige les imports avant tout code exécutable. */
  it("laisse les imports d'URL en tête du fichier", () => {
    const firstImport = out.indexOf('import { serve } from "https://');
    const firstCode = out.indexOf("interface TranscriptSegment");
    expect(firstImport).toBeGreaterThan(-1);
    expect(firstImport).toBeLessThan(firstCode);
  });

  it("ne laisse pas d'export dans un fichier qui n'est plus un module", () => {
    expect(out).not.toMatch(/^export /m);
  });
});
