/**
 * Crée une compétition, ou lit son classement, sans terminal ni écran.
 *
 * Sert deux moments : monter le défi inter-écoles la veille du lancement, et
 * lire les scores pendant qu'il tourne — depuis un téléphone, via l'onglet
 * Actions de GitHub.
 *
 *   npx tsx scripts/lancer-competition.ts modeles
 *   npx tsx scripts/lancer-competition.ts creer --nom "Bordeaux vs Toulouse" \
 *       --modele inter-ecoles --debut 2026-09-15 --lot "Soirée bière/pizza" \
 *       --equipes "KEDGE,INSEEC,Bordeaux Sciences Agro"
 *   npx tsx scripts/lancer-competition.ts classement --id <uuid>
 *
 * Demande SUPABASE_SERVICE_ROLE_KEY pour écrire.
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES, fromTemplate } from "../src/lib/competitionTemplates.js";
import { rankPlayers, rankTeams, weightsFrom } from "../src/lib/competitionScoring.js";
import { resolveEnv } from "./lib/env.js";

const arg = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
};

let cached: { url: string; key: string } | null = null;
async function config() {
  if (cached) return cached;
  const url = await resolveEnv("SUPABASE_URL", "VITE_SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("URL Supabase introuvable — attendue dans .env.");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  cached = { url: url.replace(/\/$/, ""), key };
  return cached;
}

async function rest(path: string, init: RequestInit = {}) {
  const { url, key } = await config();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body}`);
  // PostgREST répond 201 avec un corps vide sur un POST en masse assorti de
  // `Prefer: return=minimal` — pas 204. Le passer à JSON.parse lève
  // « Unexpected end of JSON input » sur un import qui avait pourtant réussi.
  return res.status === 204 || body.trim() === "" ? null : JSON.parse(body);
}

/** Un code court, lisible au téléphone : ni 0/O ni 1/I. */
const joinCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
};

async function poserModeles() {
  await rest("competition_templates", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(TEMPLATES),
  });
  console.log(`\n✅ ${TEMPLATES.length} modèles posés.\n`);
  for (const t of TEMPLATES) console.log(`   ${t.name} — ${t.default_days.length} jours`);
  console.log("");
}

async function creer() {
  const nom = arg("nom");
  const proprietaire = arg("proprietaire");
  if (!nom) throw new Error("--nom manquant.");
  if (!proprietaire) {
    throw new Error(
      "--proprietaire manquant : l'identifiant du compte qui pilotera la\n" +
        "compétition. Il se lit dans l'app, ou dans la table profiles."
    );
  }

  const cle = arg("modele") ?? "inter-ecoles";
  const modele = TEMPLATES.find((t) => t.key === cle);
  if (!modele) throw new Error(`Modèle inconnu : ${cle}`);

  const debut = arg("debut") ?? new Date().toISOString().slice(0, 10);
  const seed = fromTemplate(modele, new Date(`${debut}T00:00:00Z`));
  const equipes = (arg("equipes") ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const privee = arg("visibilite") !== "public";

  const [competition] = await rest("competitions", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      owner_id: proprietaire,
      name: nom,
      description: arg("description") ?? seed.description,
      prize: arg("lot") ?? null,
      visibility: privee ? "private" : "public",
      starts_on: seed.starts_on,
      ends_on: seed.ends_on,
      scoring: seed.scoring,
      template_key: seed.template_key,
      join_code: privee ? joinCode() : null,
    }),
  });

  const noms = equipes.length > 0 ? equipes.map((name, i) => ({
    name, color: ["#e11d48", "#2563eb", "#16a34a", "#d97706"][i % 4],
  })) : seed.teams;
  if (noms.length > 0) {
    await rest("competition_teams", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(noms.map((t) => ({ ...t, competition_id: competition.id }))),
    });
  }

  await rest("competition_days", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(seed.days.map((d) => ({ ...d, competition_id: competition.id }))),
  });

  // Le créateur est membre : sinon il ne voit pas sa propre compétition privée,
  // la politique de lecture ne parlant que des membres et du propriétaire.
  await rest("competition_members", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ competition_id: competition.id, user_id: proprietaire, role: "owner" }),
  });

  console.log(`\n✅ « ${competition.name} » créée.\n`);
  console.log(`   Identifiant : ${competition.id}`);
  console.log(`   Du ${competition.starts_on} au ${competition.ends_on} (${seed.days.length} jours)`);
  if (noms.length > 0) console.log(`   Équipes     : ${noms.map((t) => t.name).join(", ")}`);
  if (competition.join_code) {
    console.log(`\n   CODE À PARTAGER : ${competition.join_code}`);
    console.log("   C'est lui qui ouvre une compétition privée — sans lui, personne n'entre.");
  }
  console.log("\n   Les thèmes :");
  for (const d of seed.days) console.log(`     ${d.day_index}. ${d.theme}  (${d.date})`);
  console.log("");
}

async function classement() {
  const id = arg("id");
  if (!id) throw new Error("--id manquant.");

  const [competition] = await rest(`competitions?id=eq.${id}&select=*`);
  if (!competition) throw new Error("Compétition introuvable.");
  const rows = await rest(`competition_player_scores?competition_id=eq.${id}&select=*`);
  const teams = await rest(`competition_teams?competition_id=eq.${id}&select=id,name`);
  const noms = new Map<string, string>((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]));

  const players = rankPlayers(
    (rows ?? []).map((r: Record<string, string>) => ({
      user_id: r.user_id,
      team_id: r.team_id ?? null,
      posts: Number(r.posts),
      likes: Number(r.likes),
      comments: Number(r.comments),
      shares: Number(r.shares),
      day_wins: Number(r.day_wins ?? 0),
    })),
    weightsFrom(competition.scoring)
  );

  console.log(`\n${competition.name} — du ${competition.starts_on} au ${competition.ends_on}\n`);

  const classementEquipes = rankTeams(players);
  if (classementEquipes.length > 0) {
    console.log("  Équipes");
    for (const t of classementEquipes) {
      console.log(
        `    ${String(t.rank).padStart(2)}. ${(noms.get(t.team_id ?? "") ?? "—").padEnd(24)} ` +
          `${String(t.score).padStart(5)} pts  (${t.members} joueurs, ${t.posts} anecdotes)`
      );
    }
    console.log("");
  }

  console.log("  Joueurs");
  for (const p of players.slice(0, 20)) {
    console.log(
      `    ${String(p.rank).padStart(2)}. ${p.user_id.slice(0, 8)}  ${String(p.score).padStart(5)} pts  ` +
        `(${p.posts} anecdotes, ${p.likes} likes)`
    );
  }
  if (players.length > 20) console.log(`    … et ${players.length - 20} autres`);
  console.log("");
}

async function main() {
  const commande = process.argv[2];
  if (commande === "modeles") return poserModeles();
  if (commande === "creer") return creer();
  if (commande === "classement") return classement();
  throw new Error("Commande attendue : modeles | creer | classement");
}

const runDirectly = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly) {
  main().catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
