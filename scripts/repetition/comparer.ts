/**
 * La répétition générale du classement.
 *
 * Le classement vit à deux endroits : la vue `competition_player_scores`, qui
 * sert l'affichage en direct, et `competitionScoring.ts`, qui rejoue la même
 * formule pour le gel de fin de compétition. Deux implémentations d'une même
 * règle finissent par diverger — ce script est là pour que ça se voie tout de
 * suite, et pas le jour où un BDE conteste un résultat.
 *
 * Il vérifie quatre choses :
 *   - la vue et la formule TypeScript donnent le même score, joueur par joueur ;
 *   - le score d'une équipe est exactement la somme de ses joueurs ;
 *   - un calcul fait à la main, sans réutiliser la formule, retombe dessus ;
 *   - les joueurs solo ne forment pas une équipe fantôme.
 *
 * Lancé par scripts/repetition-generale.sh, qui lui fournit /tmp/vocme-view.json.
 */

import { readFileSync } from "node:fs";
import { rankPlayers, rankTeams, DEFAULT_WEIGHTS } from "../../src/lib/competitionScoring";

interface Row {
  user_id: string;
  team_id: string | null;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  score: number;
}

const rows: Row[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
let bad = 0;
const say = (ok: boolean, text: string) => {
  console.log(`  ${ok ? "✅" : "❌"} ${text}`);
  if (!ok) bad += 1;
};

const players = rankPlayers(rows, DEFAULT_WEIGHTS);

const mismatched = players.filter(
  (p) => Number(rows.find((r) => r.user_id === p.user_id)!.score) !== p.score
);
say(
  mismatched.length === 0,
  `la vue SQL et la formule TypeScript s'accordent sur les ${players.length} joueurs` +
    (mismatched.length ? ` — ${mismatched.length} écart(s)` : "")
);

console.log("\n  Classement des équipes");
const teams = rankTeams(players);
for (const team of teams) {
  const sum = players
    .filter((p) => p.team_id === team.team_id)
    .reduce((total, p) => total + p.score, 0);
  say(
    team.score === sum,
    `${team.rank}. ${team.team_id!.slice(-1)} — ${team.score} pts ` +
      `(${team.members} joueurs, somme des joueurs = ${sum})`
  );
}

console.log("");
// À la main, sans passer par scorePlayer : si les deux tombent juste, c'est que
// la formule dit bien ce qu'on annoncera aux BDE.
const rouge = players.filter((p) => p.team_id?.endsWith("1"));
const byHand = rouge.reduce(
  (total, p) => total + 1 + 5 * p.posts + p.likes + 2 * p.comments + 3 * p.shares,
  0
);
const byEngine = teams.find((t) => t.team_id?.endsWith("1"))!.score;
say(byHand === byEngine, `Rouge à la main : ${byHand} — par le moteur : ${byEngine}`);

const solo = players.filter((p) => !p.team_id).length;
say(
  teams.length === 3 && solo === 1,
  `${solo} joueur solo, ${teams.length} équipes classées (et non ${teams.length + 1})`
);

// Les anecdotes hors compétition ne doivent entrer dans aucun total.
const posts = players.reduce((total, p) => total + p.posts, 0);
say(posts === 24, `${posts} anecdotes comptées — les 9 hors concours sont écartées`);

console.log("");
process.exit(bad === 0 ? 0 : 1);
