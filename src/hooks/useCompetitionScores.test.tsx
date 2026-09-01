import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/**
 * La règle que seules les données peuvent trahir : une compétition close sert
 * son classement gelé, jamais un recalcul.
 *
 * `freezeStandings` est testé à part ; ce qui se joue ici est la décision du
 * hook. Sans elle, un like posté trois semaines après la soirée changerait
 * rétroactivement le vainqueur — et personne ne le verrait avant que quelqu'un
 * réclame son lot.
 */

const rows = vi.hoisted(() => ({ competition: {} as Record<string, unknown>, scores: [] as unknown[] }));

vi.mock("@/integrations/supabase/untyped", () => {
  const result = (table: string) => {
    const data = table === "competitions" ? rows.competition : rows.scores;
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "eq"]) chain[key] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data });
    // Une requête sans maybeSingle se résout directement : c'est le cas de la vue.
    chain.then = (resolve: (v: unknown) => void) => resolve({ data });
    return chain;
  };
  return { db: { from: result } };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  },
}));

import { useCompetitionScores } from "./useCompetitionScores";

describe("useCompetitionScores", () => {
  beforeEach(() => {
    rows.competition = {};
    rows.scores = [];
  });

  it("sert le classement gelé d'une compétition close, sans recalculer", async () => {
    rows.competition = {
      scoring: { members: 1, posts: 5, likes: 1, comments: 2, shares: 3, bonus: 20 },
      closed_at: "2026-09-08T00:00:00Z",
      final_standings: {
        players: [{ user_id: "gagnant", team_id: "A", score: 46, rank: 1 }],
        teams: [{ team_id: "A", score: 46, rank: 1 }],
      },
    };
    // Des lignes vivantes qui donneraient un tout autre résultat : si le hook
    // les regardait, le score gelé changerait sous les yeux du gagnant.
    rows.scores = [{ competition_id: "c", user_id: "gagnant", team_id: "A", posts: 99, likes: 99, comments: 0, shares: 0 }];

    const { result } = renderHook(() => useCompetitionScores("c"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.final).toBe(true);
    expect(result.current.players[0].score).toBe(46);
  });

  it("recalcule tant que la compétition court, bonus des jours dépouillés compris", async () => {
    rows.competition = {
      scoring: { members: 1, posts: 5, likes: 1, comments: 2, shares: 3, bonus: 20 },
      closed_at: null,
      final_standings: null,
    };
    rows.scores = [
      { competition_id: "c", user_id: "a", team_id: "A", posts: 1, likes: 2, comments: 0, shares: 0, day_wins: 1 },
      { competition_id: "c", user_id: "b", team_id: "A", posts: 0, likes: 0, comments: 0, shares: 0 },
    ];

    const { result } = renderHook(() => useCompetitionScores("c"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.final).toBe(false);
    // 1 + 5 + 2 + 20 = 28. La vue ne rapporte un `day_wins` qu'une fois l'urne
    // scellée à 4 h, donc ce bonus est acquis : le retenir jusqu'à la clôture
    // afficherait un classement que personne ne pourrait recouper.
    expect(result.current.players[0].score).toBe(28);
    // L'équipe est la somme de ses joueurs, jamais un second calcul.
    expect(result.current.teams[0].score).toBe(29);
  });
});
