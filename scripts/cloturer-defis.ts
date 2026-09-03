/**
 * Dépouille les jours écoulés, clôt les défis finis, et prévient les gagnants.
 *
 * C'est la pièce qui manquait pour que gagner veuille dire quelque chose.
 * Gagner un jour n'est PAS un événement de base : `day_wins` se calcule à la
 * lecture, dans la vue, à partir des votes et de l'heure. On devient vainqueur
 * parce que `now()` a dépassé 4 h — ce sur quoi aucun trigger ne peut se
 * poser. Il faut donc quelqu'un qui passe à heure fixe et le constate.
 *
 * De même, un défi ne se terminait jamais : `freezeStandings()` était écrit,
 * testé, et appelé nulle part. Un lot promis n'avait pas de vainqueur
 * officiel.
 *
 *   npx tsx scripts/cloturer-defis.ts --dry-run
 *   npx tsx scripts/cloturer-defis.ts
 *
 * Idempotent : repassé toutes les heures, il ne renotifie personne. Demande
 * SUPABASE_SERVICE_ROLE_KEY — les notifications système ont `actor_id` nul,
 * que la politique d'insertion interdit à tout compte ordinaire.
 */

import { rankPlayers, weightsFrom, freezeStandings } from "../src/lib/competitionScoring.js";
import {
  shouldClose,
  daysToSettle,
  dayWonMessage,
  resultMessage,
  type ClosableCompetition,
} from "../src/lib/competitionClosing.js";
import { DEFAULT_TIMEZONE } from "../src/lib/competitionClock.js";
import { resolveEnv } from "./lib/env.js";

const DRY = process.argv.includes("--dry-run");

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
  return res.status === 204 || body.trim() === "" ? null : JSON.parse(body);
}

interface Row { [k: string]: unknown }

const say = (line: string) => console.log(`  ${line}`);

/**
 * Écrit des notifications, sauf en répétition.
 *
 * Groupées en une seule requête : un défi de deux cents personnes qui se clôt
 * ne doit pas faire deux cents allers-retours.
 */
async function notify(rows: Row[]) {
  if (rows.length === 0) return;
  if (DRY) { say(`(répétition) ${rows.length} notification(s) non envoyées`); return; }
  await rest("notifications", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

/* ------------------------------------------------------------------ */
/* 1) Le dépouillement des jours écoulés                               */
/* ------------------------------------------------------------------ */

async function settleDays(now: Date) {
  const comps = (await rest(
    "competitions?select=id,name,timezone,scoring,closed_at&closed_at=is.null"
  )) as Row[] | null;
  if (!comps || comps.length === 0) return;

  const byId = new Map(comps.map((c) => [c.id as string, c]));
  const ids = [...byId.keys()];

  // Les jours des défis en cours, et ce qui a déjà été annoncé.
  const days = ((await rest(
    `competition_days?select=id,date,theme,day_index,competition_id&competition_id=in.(${ids.join(",")})`
  )) ?? []) as Row[];
  const announced = new Set(
    (((await rest("competition_day_awards?select=day_id")) ?? []) as Row[])
      .map((a) => a.day_id as string)
  );

  const pending = daysToSettle(
    days.map((d) => ({
      id: d.id as string,
      date: d.date as string,
      competition_id: d.competition_id as string,
    })),
    announced,
    (compId) => (byId.get(compId)?.timezone as string) ?? DEFAULT_TIMEZONE,
    now
  );
  if (pending.length === 0) { say("aucun jour à dépouiller"); return; }

  for (const day of pending) {
    const comp = byId.get(day.competition_id)!;
    const theme = (days.find((d) => d.id === day.id)?.theme as string) ?? "the day";
    const bonus = weightsFrom(comp.scoring).bonus;

    // Les votes de ce jour, et l'auteur de chaque anecdote votée.
    const votes = ((await rest(
      `competition_votes?select=post_id&day_id=eq.${day.id}`
    )) ?? []) as Row[];
    if (votes.length === 0) {
      // Personne n'a voté : le jour est dépouillé quand même, sinon la tâche
      // le rouvrirait à chaque passage.
      if (!DRY) {
        // `user_id` nul : le jour est marqué dépouillé sans désigner personne.
        await rest("competition_day_awards", {
          method: "POST",
          headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
          body: JSON.stringify([{ day_id: day.id, user_id: null }]),
        });
      }
      say(`jour « ${theme} » : aucun vote`);
      continue;
    }

    const tally = new Map<string, number>();
    for (const v of votes) {
      const c = tally.get(v.post_id as string) ?? 0;
      tally.set(v.post_id as string, c + 1);
    }
    const best = Math.max(...tally.values());
    const topPosts = [...tally.entries()].filter(([, n]) => n === best).map(([id]) => id);

    const authors = ((await rest(
      `voice_posts?select=id,user_id&id=in.(${topPosts.join(",")})`
    )) ?? []) as Row[];
    // Les ex æquo gagnent tous — la même règle que la vue, qui utilise RANK().
    const winners = [...new Set(authors.map((a) => a.user_id as string))];

    say(`jour « ${theme} » : ${winners.length} gagnant(s), ${best} voix`);

    if (!DRY) {
      // Le registre AVANT la notification : si l'envoi échoue, on ne
      // renotifiera pas — mieux vaut une annonce manquée qu'une annonce
      // répétée chaque heure.
      await rest("competition_day_awards", {
        method: "POST",
        headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
        body: JSON.stringify(winners.map((u) => ({ day_id: day.id, user_id: u }))),
      });
    }
    await notify(
      winners.map((u) => ({
        user_id: u,
        type: "competition_day_won",
        competition_id: comp.id,
      }))
    );
    say(`  → ${dayWonMessage(theme, bonus)}`);
  }
}

/* ------------------------------------------------------------------ */
/* 2) La clôture des défis terminés                                    */
/* ------------------------------------------------------------------ */

async function closeFinished(now: Date) {
  const comps = (((await rest(
    "competitions?select=id,name,ends_on,timezone,scoring,closed_at&closed_at=is.null"
  )) ?? []) as Row[]).filter((c) =>
    shouldClose(
      {
        id: c.id as string,
        ends_on: c.ends_on as string,
        timezone: c.timezone as string | null,
        closed_at: c.closed_at as string | null,
      } satisfies ClosableCompetition,
      now
    )
  );
  if (comps.length === 0) { say("aucun défi à clôturer"); return; }

  for (const comp of comps) {
    const rows = ((await rest(
      `competition_player_scores?select=*&competition_id=eq.${comp.id}`
    )) ?? []) as Row[];
    const tallies = rows.map((r) => ({
      user_id: r.user_id as string,
      team_id: (r.team_id as string | null) ?? null,
      posts: Number(r.posts),
      likes: Number(r.likes),
      comments: Number(r.comments),
      shares: Number(r.shares),
      day_wins: Number(r.day_wins ?? 0),
    }));

    const closedAt = now.toISOString();
    const standings = freezeStandings(tallies, weightsFrom(comp.scoring), closedAt);
    say(`clôture de « ${comp.name} » — ${tallies.length} joueur(s)`);

    if (!DRY) {
      // Le gel D'ABORD : une fois `closed_at` posé, l'application sert le
      // classement figé et cesse de recalculer. L'écrire après les
      // notifications laisserait une fenêtre où l'on annonce un vainqueur que
      // l'écran contredit encore.
      await rest(`competitions?id=eq.${comp.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ closed_at: closedAt, final_standings: standings }),
      });
    }

    const winnerId = standings.winner_user_id;
    let winnerName: string | null = null;
    if (winnerId) {
      const profiles = ((await rest(
        `profiles?select=display_name&id=eq.${winnerId}`
      )) ?? []) as Row[];
      winnerName = (profiles[0]?.display_name as string) ?? null;
    }

    say(`  → ${resultMessage(comp.name as string, false, winnerName)}`);
    await notify(
      standings.players.map((p) => ({
        user_id: p.user_id,
        type: "competition_result",
        competition_id: comp.id,
      }))
    );
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  const now = new Date();
  console.log("");
  console.log(DRY ? "Répétition — rien ne sera écrit" : "Dépouillement et clôtures");
  console.log("");
  await settleDays(now);
  await closeFinished(now);
  console.log("");
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
