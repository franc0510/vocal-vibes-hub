import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/untyped";
import {
  rankPlayers, rankTeams, weightsFrom, pendingBonuses,
  type PlayerScore, type TeamScore, type PlayerTally,
} from "@/lib/competitionScoring";

/**
 * Les deux classements, tenus à jour en direct.
 *
 * Tout ce qui touche au calcul passe par ce hook. C'est délibéré : la vue
 * balaie les anecdotes et les réactions à chaque lecture, ce qui suffit
 * largement à l'échelle de deux écoles mais devra un jour laisser la place à
 * des compteurs incrémentaux. Le jour venu, ce remplacement ne touchera aucun
 * écran.
 *
 * Le classement d'équipe n'est jamais recalculé : c'est la somme des joueurs.
 * Deux formules parallèles finiraient par se contredire, et l'écart serait
 * impossible à expliquer à un BDE qui vient de perdre une soirée.
 */

export interface Standings {
  players: PlayerScore[];
  teams: TeamScore[];
  /** Bonus « meilleure anecdote du jour » encore à distribuer. */
  pending: number;
  /** Vrai une fois la compétition close : les bonus sont alors comptés. */
  final: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

interface ScoreRow extends PlayerTally {
  competition_id: string;
}

export const useCompetitionScores = (competitionId: string | undefined): Standings => {
  const [players, setPlayers] = useState<PlayerScore[]>([]);
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [pending, setPending] = useState(0);
  const [final, setFinal] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!competitionId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: comp } = await db
        .from("competitions")
        .select("scoring, closed_at, final_standings")
        .eq("id", competitionId)
        .maybeSingle();

      // Une compétition close sert son classement gelé, pas un recalcul : sans
      // ça, un like posté trois semaines plus tard changerait rétroactivement
      // le vainqueur d'une soirée déjà offerte.
      if (comp?.closed_at && comp.final_standings) {
        setPlayers(comp.final_standings.players ?? []);
        setTeams(comp.final_standings.teams ?? []);
        setPending(0);
        setFinal(true);
        return;
      }

      const { data } = await db
        .from("competition_player_scores")
        .select("*")
        .eq("competition_id", competitionId);

      const rows = ((data ?? []) as ScoreRow[]).map((r) => ({
        ...r,
        posts: Number(r.posts),
        likes: Number(r.likes),
        comments: Number(r.comments),
        shares: Number(r.shares),
        day_wins: Number(r.day_wins ?? 0),
      }));

      // Le classement est rejoué ici plutôt que lu tel quel de la vue : c'est
      // la même formule, mais elle nous donne les rangs, les égalités et la
      // somme par équipe sans un second aller-retour.
      const weights = weightsFrom(comp?.scoring);
      const ranked = rankPlayers(rows, weights, false);
      setPlayers(ranked);
      setTeams(rankTeams(ranked));
      setPending(pendingBonuses(rows));
      setFinal(false);
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Le tableau bouge sous les yeux.
   *
   * On écoute les inscriptions et les votes, mais aussi les likes et les
   * commentaires : ce sont eux qui font bouger un classement pendant une
   * soirée, et rafraîchir seulement à l'arrivée d'un membre laisserait
   * l'écran figé pendant des heures.
   */
  useEffect(() => {
    if (!competitionId) return;
    const channel = supabase
      .channel(`competition_scores:${competitionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_members" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_votes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_post_likes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [competitionId, refresh]);

  return { players, teams, pending, final, loading, refresh };
};
