import { describe, it, expect } from "vitest";
import {
  DEFAULT_WEIGHTS,
  weightsFrom,
  scorePlayer,
  rankPlayers,
  rankTeams,
  pendingBonuses,
  canEditDay,
  canChangeTeam,
  freezeStandings,
  type PlayerTally,
} from "./competitionScoring";

const player = (over: Partial<PlayerTally> & { user_id: string }): PlayerTally => ({
  team_id: null,
  posts: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  ...over,
});

describe("scorePlayer", () => {
  it("applique les coefficients terme à terme", () => {
    const score = scorePlayer(
      player({ user_id: "a", posts: 2, likes: 10, comments: 3, shares: 1 }),
      DEFAULT_WEIGHTS
    );
    // 1 (membre) + 5×2 + 1×10 + 2×3 + 3×1
    expect(score).toBe(1 + 10 + 10 + 6 + 3);
  });

  it("compte le point de membre même sans rien publier", () => {
    expect(scorePlayer(player({ user_id: "a" }), DEFAULT_WEIGHTS)).toBe(1);
  });

  it("ignore les bonus tant que la compétition court", () => {
    const t = player({ user_id: "a", day_wins: 2 });
    expect(scorePlayer(t, DEFAULT_WEIGHTS)).toBe(1);
    expect(scorePlayer(t, DEFAULT_WEIGHTS, true)).toBe(1 + 40);
  });
});

describe("weightsFrom", () => {
  it("lit les coefficients de la compétition", () => {
    expect(weightsFrom({ members: 0, posts: 3 }).posts).toBe(3);
    expect(weightsFrom({ members: 0, posts: 3 }).members).toBe(0);
  });

  it("retombe sur la valeur par défaut, pas sur zéro, quand c'est illisible", () => {
    // Un JSON mal formé ne doit pas annuler un terme en silence au milieu
    // d'un défi : le score changerait sans que personne comprenne pourquoi.
    expect(weightsFrom({ posts: "beaucoup" }).posts).toBe(DEFAULT_WEIGHTS.posts);
    expect(weightsFrom(null)).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("rankTeams", () => {
  /**
   * Trois équipes, pas deux : avec deux, une erreur de groupement se cache
   * derrière un classement qui a l'air juste.
   */
  const tallies = [
    player({ user_id: "a1", team_id: "A", posts: 3, likes: 20 }),
    player({ user_id: "a2", team_id: "A", posts: 1, likes: 4, comments: 2 }),
    player({ user_id: "b1", team_id: "B", posts: 5, likes: 30, shares: 2 }),
    player({ user_id: "c1", team_id: "C", posts: 1 }),
    player({ user_id: "c2", team_id: "C", likes: 3 }),
    player({ user_id: "c3", team_id: "C", comments: 1 }),
  ];

  it("la somme des joueurs d'une équipe égale exactement le score de l'équipe", () => {
    // Le seul contrôle qui prouve que les deux tableaux ne peuvent pas se
    // contredire — donc que la formule dit bien ce qu'on annonce aux BDE.
    const players = rankPlayers(tallies, DEFAULT_WEIGHTS);
    const teams = rankTeams(players);
    for (const team of teams) {
      const sum = players
        .filter((p) => p.team_id === team.team_id)
        .reduce((total, p) => total + p.score, 0);
      expect(team.score).toBe(sum);
    }
  });

  it("le poids « membres » vaut bien w × effectif de l'équipe", () => {
    const weights = { ...DEFAULT_WEIGHTS, members: 10, posts: 0, likes: 0, comments: 0, shares: 0 };
    const teams = rankTeams(rankPlayers(tallies, weights));
    expect(teams.find((t) => t.team_id === "C")!.score).toBe(30);
    expect(teams.find((t) => t.team_id === "B")!.score).toBe(10);
  });

  it("ne regroupe pas les joueurs solo en une équipe fantôme", () => {
    const teams = rankTeams(rankPlayers([player({ user_id: "seul" })], DEFAULT_WEIGHTS));
    expect(teams).toEqual([]);
  });

  it("classe les équipes par score décroissant", () => {
    const teams = rankTeams(rankPlayers(tallies, DEFAULT_WEIGHTS));
    expect(teams.map((t) => t.team_id)).toEqual(["B", "A", "C"]);
    expect(teams[0].rank).toBe(1);
  });
});

describe("égalités", () => {
  it("partage le rang et fait sauter le suivant", () => {
    const scores = rankPlayers(
      [
        player({ user_id: "a", likes: 5 }),
        player({ user_id: "b", likes: 5 }),
        player({ user_id: "c", likes: 1 }),
      ],
      DEFAULT_WEIGHTS
    );
    expect(scores.map((s) => s.rank)).toEqual([1, 1, 3]);
  });

  it("ne désigne aucun vainqueur en cas d'égalité parfaite", () => {
    // Mieux vaut un champ vide, que l'organisateur tranche, qu'un gagnant
    // choisi par l'ordre d'arrivée des lignes.
    const final = freezeStandings(
      [
        player({ user_id: "a", team_id: "A", likes: 5 }),
        player({ user_id: "b", team_id: "B", likes: 5 }),
      ],
      DEFAULT_WEIGHTS,
      "2026-09-08T00:00:00Z"
    );
    expect(final.winner_team_id).toBeNull();
    expect(final.winner_user_id).toBeNull();
  });
});

describe("freezeStandings", () => {
  it("compte les bonus, et peut renverser le classement", () => {
    const tallies = [
      player({ user_id: "gros", team_id: "A", likes: 30 }),
      player({ user_id: "fin", team_id: "B", likes: 5, day_wins: 2 }),
    ];
    expect(rankPlayers(tallies, DEFAULT_WEIGHTS)[0].user_id).toBe("gros");

    const final = freezeStandings(tallies, DEFAULT_WEIGHTS, "2026-09-08T00:00:00Z");
    // 1 + 5 + 40 = 46 contre 31 : le bonus renverse, et c'est voulu.
    expect(final.winner_user_id).toBe("fin");
    expect(final.winner_team_id).toBe("B");
    expect(final.closed_at).toBe("2026-09-08T00:00:00Z");
  });

  it("annonce d'avance les bonus encore à distribuer", () => {
    expect(pendingBonuses([player({ user_id: "a", day_wins: 3 }), player({ user_id: "b" })])).toBe(3);
  });
});

describe("règles d'intégrité", () => {
  it("refuse de rouvrir le thème d'un jour passé ou en cours", () => {
    expect(canEditDay("2026-09-05", "2026-09-01")).toBe(true);
    expect(canEditDay("2026-09-01", "2026-09-01")).toBe(false);
    expect(canEditDay("2026-08-30", "2026-09-01")).toBe(false);
  });

  it("verrouille l'équipe dès le premier point marqué", () => {
    expect(canChangeTeam({ locked_at: null })).toBe(true);
    expect(canChangeTeam({})).toBe(true);
    expect(canChangeTeam({ locked_at: "2026-09-02T10:00:00Z" })).toBe(false);
  });
});
