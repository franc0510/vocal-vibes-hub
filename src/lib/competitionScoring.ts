/**
 * Le classement d'une compétition.
 *
 * Un seul calcul, par joueur. Le classement d'équipe n'en est que la somme —
 * jamais un second calcul. Deux formules parallèles finiraient tôt ou tard par
 * se contredire, et c'est exactement l'écart qu'on ne peut pas expliquer à un
 * BDE qui vient de perdre une soirée.
 *
 * Cette formule est le jumeau de la vue `competition_player_scores`. La base
 * sert le classement en direct ; ce module le rejoue à l'identique pour les
 * simulations, le gel de fin de compétition et les tests. Les deux lisent les
 * mêmes coefficients, stockés dans `competitions.scoring`.
 */

/** Coefficients, tels que stockés en base. */
export interface ScoringWeights {
  /** Compté une fois par joueur : sommé, il donne w × effectif de l'équipe. */
  members: number;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  /** Meilleure anecdote d'un jour. Attribué au dépouillement, à 4 h. */
  bonus: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  members: 1,
  posts: 5,
  likes: 1,
  comments: 2,
  shares: 3,
  bonus: 20,
};

/** Ce qu'un joueur a produit. Des comptes bruts, rien de calculé. */
export interface PlayerTally {
  user_id: string;
  team_id: string | null;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  /**
   * Jours DÉPOUILLÉS dont ce joueur a remporté la meilleure anecdote. Le jour
   * en cours n'y figure jamais : ses voix peuvent encore changer.
   */
  day_wins?: number;
}

export interface PlayerScore extends PlayerTally {
  day_wins: number;
  score: number;
  /** 1 pour le premier. Deux joueurs à égalité partagent le même rang. */
  rank: number;
}

export interface TeamScore {
  team_id: string | null;
  members: number;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  day_wins: number;
  score: number;
  rank: number;
}

/**
 * Les coefficients d'une compétition, lus depuis le JSONB.
 *
 * Une valeur absente ou illisible retombe sur la valeur par défaut plutôt que
 * sur zéro : un JSON mal formé ne doit pas silencieusement annuler un terme du
 * score au milieu d'un défi.
 */
export function weightsFrom(raw: unknown): ScoringWeights {
  const source = (raw ?? {}) as Record<string, unknown>;
  const read = (key: keyof ScoringWeights) => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? value : DEFAULT_WEIGHTS[key];
  };
  return {
    members: read("members"),
    posts: read("posts"),
    likes: read("likes"),
    comments: read("comments"),
    shares: read("shares"),
    bonus: read("bonus"),
  };
}

/**
 * Le score d'un joueur.
 *
 * `day_wins` ne compte que des jours DÉPOUILLÉS — l'urne se scelle à 4 h le
 * lendemain, et la vue SQL n'en rapporte pas d'autres. Un bonus porté au
 * classement est donc acquis, et `countBonus` vaut vrai pour le classement en
 * direct : le tableau bouge chaque matin à heure fixe, ce qui fait rouvrir
 * l'application bien mieux qu'un total figé pendant six jours.
 *
 * Le drapeau reste, à faux, pour ce qu'il sert encore : simuler un barème sans
 * ses bonus, et vérifier en test qu'un terme pèse bien ce qu'on croit.
 */
export function scorePlayer(
  tally: PlayerTally,
  weights: ScoringWeights,
  countBonus = true
): number {
  const wins = countBonus ? tally.day_wins ?? 0 : 0;
  return (
    weights.members +
    weights.posts * tally.posts +
    weights.likes * tally.likes +
    weights.comments * tally.comments +
    weights.shares * tally.shares +
    weights.bonus * wins
  );
}

/**
 * Attribue un rang, égalités comprises.
 *
 * Deux scores identiques partagent le rang, et le suivant saute d'autant :
 * 1, 1, 3. Afficher deux « 2e » côte à côte serait faux, et les départager au
 * hasard le serait davantage.
 */
function ranked<T extends { score: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  let rank = 0;
  let previous: number | null = null;
  return sorted.map((row, i) => {
    if (previous === null || row.score !== previous) rank = i + 1;
    previous = row.score;
    return { ...row, rank };
  });
}

export function rankPlayers(
  tallies: PlayerTally[],
  weights: ScoringWeights,
  countBonus = true
): PlayerScore[] {
  return ranked(
    tallies.map((t) => ({
      ...t,
      day_wins: t.day_wins ?? 0,
      score: scorePlayer(t, weights, countBonus),
    }))
  );
}

/**
 * Le classement des équipes, obtenu en sommant les joueurs — jamais recalculé.
 *
 * Les joueurs sans équipe ne sont pas regroupés sous un `null` commun : ils ne
 * forment pas une équipe, ils jouent en solo, et les additionner inventerait un
 * concurrent qui n'existe pas. Ils sont donc simplement écartés d'ici ; c'est
 * `rankPlayers` qui les classe.
 */
export function rankTeams(players: PlayerScore[]): TeamScore[] {
  const byTeam = new Map<string, TeamScore>();
  for (const p of players) {
    if (!p.team_id) continue;
    const team = byTeam.get(p.team_id) ?? {
      team_id: p.team_id,
      members: 0,
      posts: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      day_wins: 0,
      score: 0,
      rank: 0,
    };
    team.members += 1;
    team.posts += p.posts;
    team.likes += p.likes;
    team.comments += p.comments;
    team.shares += p.shares;
    team.day_wins += p.day_wins;
    team.score += p.score;
    byTeam.set(p.team_id, team);
  }
  return ranked([...byTeam.values()]);
}

/**
 * Peut-on encore réécrire le thème de ce jour ?
 *
 * Non dès qu'il a commencé. Un créateur qui change le thème d'hier réécrit
 * l'histoire d'une compétition dotée d'un lot, et invalide les anecdotes déjà
 * publiées sous l'ancien. La base applique la même règle ; celle-ci évite
 * seulement de proposer un champ que le serveur refusera.
 */
export function canEditDay(dayDate: string, today: string): boolean {
  return dayDate > today;
}

/**
 * Peut-on encore changer d'équipe ?
 *
 * Une équipe choisie dans une liste est déclarative, donc trichable quand il y
 * a un lot : sans cette règle, on rejoint la veille de la clôture l'équipe qui
 * mène. Le verrou tombe au premier point marqué, et ne se rouvre pas.
 */
export function canChangeTeam(member: { locked_at?: string | null }): boolean {
  return !member.locked_at;
}

/** Le classement figé à la clôture, tel qu'écrit dans `final_standings`. */
export interface FinalStandings {
  closed_at: string;
  teams: TeamScore[];
  players: PlayerScore[];
  winner_team_id: string | null;
  winner_user_id: string | null;
}

/**
 * Gèle le résultat.
 *
 * Sans ce gel, un like posté trois semaines plus tard changerait
 * rétroactivement le vainqueur d'une soirée déjà offerte. Les bonus des jours
 * dépouillés y sont, comme dans le classement en direct : le gel photographie
 * l'état du moment, il ne le recalcule pas autrement.
 *
 * En cas d'égalité au sommet, aucun vainqueur n'est désigné : mieux vaut un
 * champ vide, que l'organisateur tranche, qu'un gagnant choisi par l'ordre
 * d'arrivée des lignes.
 */
export function freezeStandings(
  tallies: PlayerTally[],
  weights: ScoringWeights,
  closedAt: string
): FinalStandings {
  const players = rankPlayers(tallies, weights, true);
  const teams = rankTeams(players);
  const sole = <T extends { rank: number }>(rows: T[]): T | null => {
    const first = rows.filter((r) => r.rank === 1);
    return first.length === 1 ? first[0] : null;
  };
  return {
    closed_at: closedAt,
    teams,
    players,
    winner_team_id: sole(teams)?.team_id ?? null,
    winner_user_id: sole(players)?.user_id ?? null,
  };
}
