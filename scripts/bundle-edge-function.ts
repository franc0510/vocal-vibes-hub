/**
 * La fonction `transcribe-audio`, en un seul fichier à coller.
 *
 * POURQUOI CE SCRIPT EXISTE.
 *
 * L'éditeur d'Edge Functions du tableau de bord Supabase ne voit que le
 * dossier de la fonction. Or `transcribe-audio/index.ts` importe
 * `../_shared/transcribe.ts` — un fichier partagé avec `illustrate-story`,
 * hors de ce dossier — que l'éditeur ne peut donc ni montrer ni résoudre.
 * Coller `index.ts` tel quel dans le tableau de bord donne une fonction qui
 * ne démarre pas.
 *
 * D'où cette version repliée : le module partagé est recopié à l'intérieur,
 * l'import disparaît, et le résultat tient dans une seule fenêtre d'éditeur.
 *
 * Il est GÉNÉRÉ, jamais modifié à la main. Un test vérifie qu'il correspond
 * toujours à ses sources : sans cela, corriger `_shared/transcribe.ts` sans
 * régénérer laisserait le tableau de bord déployer une version périmée — et
 * c'est exactement la panne silencieuse qu'on vient de passer trois heures à
 * traquer.
 *
 *   npx tsx scripts/bundle-edge-function.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");

export const SOURCES = {
  shared: "supabase/functions/_shared/transcribe.ts",
  entry: "supabase/functions/transcribe-audio/index.ts",
  bundle: "supabase/functions/transcribe-audio/DEPLOY-VIA-DASHBOARD.ts",
};

const HEADER = `// =============================================================
//  transcribe-audio — VERSION À COLLER DANS LE TABLEAU DE BORD
// =============================================================
//
//  FICHIER GÉNÉRÉ. Ne pas le modifier à la main : éditer
//  supabase/functions/_shared/transcribe.ts ou
//  supabase/functions/transcribe-audio/index.ts, puis relancer
//    npx tsx scripts/bundle-edge-function.ts
//
//  À QUOI IL SERT
//  L'éditeur du tableau de bord Supabase ne voit que le dossier de la
//  fonction, alors que le vrai index.ts importe ../_shared/transcribe.ts.
//  Ici ce module est recopié à l'intérieur : le fichier est autonome.
//
//  COMMENT S'EN SERVIR
//    Tableau de bord Supabase → Edge Functions → transcribe-audio →
//    remplacer tout le contenu par ce fichier → Deploy.
//
//  Déployer avec le CLI (supabase functions deploy transcribe-audio) reste
//  le chemin normal ; celui-ci existe pour s'en passer.
// =============================================================

`;

/** Le type que `transcribe.ts` importait de `storyboard.ts`. */
const INLINED_TYPE = `interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  text: string;
}
`;

/** Replie les deux fichiers en un seul, sans import relatif. */
export const bundle = (sharedSource: string, entrySource: string): string => {
  const shared = sharedSource
    .replace(/^import type \{ TranscriptSegment \} from "\.\/storyboard\.ts";\n/m, INLINED_TYPE)
    // Le module replié n'exporte plus rien : tout est dans le même fichier.
    .replace(/^export (interface|function|const|async function) /gm, "$1 ");

  const entry = entrySource.replace(
    /^import \{ transcribe \} from "\.\.\/_shared\/transcribe\.ts";\n/m,
    ""
  );

  // Les imports d'URL du point d'entrée restent en tête : Deno les exige
  // avant tout code exécutable.
  const urlImports = entry.match(/^import .+ from "https:\/\/.+";$/gm) ?? [];
  const body = entry.replace(/^import .+ from "https:\/\/.+";\n/gm, "");

  return [
    HEADER + urlImports.join("\n"),
    "// ---------- replié depuis supabase/functions/_shared/transcribe.ts ----------",
    shared.trim(),
    "// ---------- fin du module replié ----------",
    body.trim(),
    "",
  ].join("\n\n");
};

export const buildFromDisk = (root = ROOT): string =>
  bundle(
    readFileSync(join(root, SOURCES.shared), "utf8"),
    readFileSync(join(root, SOURCES.entry), "utf8")
  );

// Exécuté directement : (re)génère le fichier.
if (process.argv[1]?.endsWith("bundle-edge-function.ts")) {
  const out = join(ROOT, SOURCES.bundle);
  writeFileSync(out, buildFromDisk());
  console.log(`✅ ${SOURCES.bundle} régénéré`);
}
