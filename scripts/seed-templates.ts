/**
 * Pousse les modèles de compétition en base.
 *
 * Les modèles vivent dans `src/lib/competitionTemplates.ts` mais servent depuis
 * la base : ajouter « Mariage » ou « Séminaire » ne demande alors aucune
 * publication sur l'App Store. Ce script est le seul écrivain de la table —
 * elle n'a volontairement aucune politique d'écriture.
 *
 *   npx tsx scripts/seed-templates.ts          # montre ce qui serait écrit
 *   npx tsx scripts/seed-templates.ts --yes    # écrit
 *
 * Demande SUPABASE_SERVICE_ROLE_KEY : la clé publique ne peut pas écrire ici.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES } from "../src/lib/competitionTemplates.js";
import { resolveEnv } from "./lib/env.js";

/**
 * PostgREST répond 201 avec un corps vide à un POST en masse assorti de
 * `Prefer: return=minimal` — pas 204. Passer ça à JSON.parse lève
 * « Unexpected end of JSON input », ce qui a déjà coûté une session de
 * débogage sur un import qui avait pourtant réussi.
 */
export function parseRestBody(status: number, body: string): unknown {
  if (status === 204 || body.trim() === "") return null;
  return JSON.parse(body);
}

async function main() {
  const write = process.argv.slice(2).includes("--yes");

  console.log(`\n${TEMPLATES.length} modèles :\n`);
  for (const t of TEMPLATES) {
    console.log(
      `  ${t.name.padEnd(24)} ${String(t.default_days.length).padStart(2)} jour(s), ` +
        `${t.uses_teams ? `${t.default_teams.length || "n"} équipe(s)` : "sans équipe"}`
    );
  }

  if (!write) {
    console.log("\nRien n'a été écrit. Relance avec --yes.\n");
    return;
  }

  // Les identifiants ne sont demandés qu'ici : lire ce qu'on s'apprête à
  // écrire ne devrait rien exiger.
  const url = await resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("URL Supabase introuvable — attendue dans .env.");
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante.\n" +
        "La table des modèles n'a aucune politique d'écriture : la clé publique\n" +
        "ne peut rien y mettre, c'est voulu."
    );
  }

  // resolution=merge-duplicates : le script est rejouable, et corriger un
  // thème consiste à le modifier ici puis à relancer.
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/competition_templates`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(TEMPLATES),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  parseRestBody(res.status, body);

  console.log(
    "\n✅ Modèles à jour.\n\n" +
      "Un modèle est un point de départ : créer une compétition copie ses\n" +
      "valeurs, donc les compétitions déjà lancées ne bougent pas.\n"
  );
}

const runDirectly = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly) {
  main().catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
