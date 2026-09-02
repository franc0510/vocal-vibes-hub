/**
 * La répétition générale du classement.
 *
 * Le classement vit à deux endroits : la vue `competition_player_scores`, qui
 * sert l'affichage en direct, et `competitionScoring.ts`, qui rejoue la même
 * formule pour le gel de fin de compétition. Deux implémentations d'une même
 * règle finissent par diverger — ce script est là pour que ça se voie tout de
 * suite, et pas le jour où un BDE conteste un résultat.
 *
 * Il vérifie six choses :
 *   - la vue et la formule TypeScript donnent le même score, joueur par joueur ;
 *   - le score d'une équipe est exactement la somme de ses joueurs ;
 *   - un calcul fait à la main, sans réutiliser la formule, retombe dessus ;
 *   - les joueurs solo ne forment pas une équipe fantôme ;
 *   - le dépouillement crédite TOUS les ex æquo d'un jour scellé ;
 *   - le jour en cours ne crédite personne, malgré des voix bien réelles.
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
  /** Jours dépouillés remportés. Le jour en cours n'y figure jamais. */
  day_wins: number;
  score: number;
}

// `day_wins` arrive de Postgres en bigint, donc parfois en chaîne : le
// normaliser ici évite une comparaison « "1" !== 1 » qui ferait passer une
// vraie divergence pour un bug de typage.
const rows: Row[] = (JSON.parse(readFileSync(process.argv[2], "utf8")) as Row[]).map(
  (r) => ({ ...r, day_wins: Number(r.day_wins ?? 0) })
);
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
// la formule dit bien ce qu'on annoncera aux BDE. Le bonus en fait partie —
// c'est le terme le plus lourd du barème, l'oublier ici ne prouverait rien.
const rouge = players.filter((p) => p.team_id?.endsWith("1"));
const byHand = rouge.reduce(
  (total, p) =>
    total + 1 + 5 * p.posts + p.likes + 2 * p.comments + 3 * p.shares + 20 * p.day_wins,
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

console.log("\n  Le dépouillement");
/**
 * Le jour 1 s'est clos à 4 h ce matin, sur une égalité à deux voix : les
 * joueurs 1 et 2 le remportent tous les deux. Le jour 2 court encore, avec
 * trois voix pour le joueur 9 — et ne doit créditer personne.
 *
 * Les identifiants sont des UUID aléatoires, donc on compte plutôt que de
 * nommer : deux gagnants, un seul jour, et pas un bonus de plus.
 */
const winners = players.filter((p) => p.day_wins > 0);
say(
  winners.length === 2 && winners.every((p) => p.day_wins === 1),
  `${winners.length} gagnant(s) pour le jour dépouillé — les ex æquo gagnent tous`
);
const totalWins = players.reduce((total, p) => total + p.day_wins, 0);
say(
  totalWins === 2,
  `${totalWins} bonus distribués — le jour en cours n'en verse aucun malgré ses voix`
);

console.log("");
process.exit(bad === 0 ? 0 : 1);
