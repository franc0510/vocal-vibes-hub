import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { canChangeTeam, canEditDay } from "@/lib/competitionScoring";
import type { Competition } from "./useCompetitions";

/**
 * Une compétition : ses jours, ses équipes, et ma place dedans.
 *
 * Les règles d'intégrité sont dans la base ; celles qui reviennent ici ne
 * servent qu'à ne pas proposer un bouton que le serveur refusera.
 */

export interface CompetitionTeam {
  id: string;
  competition_id: string;
  name: string;
  color: string | null;
}

export interface CompetitionDay {
  id: string;
  competition_id: string;
  day_index: number;
  theme: string;
  date: string;
}

export interface Membership {
  competition_id: string;
  user_id: string;
  team_id: string | null;
  role: string;
  locked_at: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);

export const useCompetition = (competitionId: string | undefined) => {
  const { user } = useAuth();
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [teams, setTeams] = useState<CompetitionTeam[]>([]);
  const [days, setDays] = useState<CompetitionDay[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!competitionId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [comp, tms, dys] = await Promise.all([
        db.from("competitions").select("*").eq("id", competitionId).maybeSingle(),
        db.from("competition_teams").select("*").eq("competition_id", competitionId).order("name"),
        db.from("competition_days").select("*").eq("competition_id", competitionId).order("day_index"),
      ]);
      setCompetition((comp.data ?? null) as Competition | null);
      setTeams((tms.data ?? []) as CompetitionTeam[]);
      setDays((dys.data ?? []) as CompetitionDay[]);

      if (user) {
        const { data } = await db
          .from("competition_members")
          .select("*")
          .eq("competition_id", competitionId)
          .eq("user_id", user.id)
          .maybeSingle();
        setMembership((data ?? null) as Membership | null);
      } else {
        setMembership(null);
      }
    } finally {
      setLoading(false);
    }
  }, [competitionId, user]);

  useEffect(() => { refresh(); }, [refresh]);

  /** Le jour en cours, ou rien si la compétition n'a pas commencé ou est finie. */
  const currentDay = days.find((d) => d.date === today()) ?? null;

  const isOwner = Boolean(user && competition && competition.owner_id === user.id);
  const isMember = Boolean(membership);
  const isOver = Boolean(competition && competition.ends_on < today());

  /**
   * Changer d'équipe, tant que rien n'a été marqué.
   *
   * Le verrou n'est pas une politesse : une équipe choisie dans une liste est
   * déclarative, donc trichable quand il y a un lot. Sans lui, on rejoint la
   * veille de la clôture celle qui mène.
   */
  const chooseTeam = useCallback(
    async (teamId: string | null) => {
      if (!user || !competitionId) return;
      if (membership && !canChangeTeam(membership)) {
        throw new Error("Ton équipe est verrouillée depuis ton premier point.");
      }
      const { error } = await db
        .from("competition_members")
        .update({ team_id: teamId })
        .eq("competition_id", competitionId)
        .eq("user_id", user.id);
      if (error) throw error;
      await refresh();
    },
    [user, competitionId, membership, refresh]
  );

  const leave = useCallback(async () => {
    if (!user || !competitionId) return;
    await db
      .from("competition_members")
      .delete()
      .eq("competition_id", competitionId)
      .eq("user_id", user.id);
    await refresh();
  }, [user, competitionId, refresh]);

  /**
   * Réécrire un thème — seulement pour un jour à venir.
   *
   * La base applique la même règle. Celle-ci évite d'afficher un champ que le
   * serveur refusera, et de laisser croire qu'on peut réécrire l'histoire d'une
   * compétition dotée d'un lot.
   */
  const setTheme = useCallback(
    async (dayId: string, theme: string) => {
      const day = days.find((d) => d.id === dayId);
      if (!day) return;
      if (!canEditDay(day.date, today())) {
        throw new Error("Ce jour a commencé : son thème ne se change plus.");
      }
      const { error } = await db.from("competition_days").update({ theme }).eq("id", dayId);
      if (error) throw error;
      await refresh();
    },
    [days, refresh]
  );

  const update = useCallback(
    async (patch: Partial<Pick<Competition, "name" | "description" | "prize" | "visibility">>) => {
      if (!competitionId) return;
      const { error } = await db.from("competitions").update(patch).eq("id", competitionId);
      if (error) throw error;
      await refresh();
    },
    [competitionId, refresh]
  );

  return {
    competition, teams, days, membership, currentDay,
    isOwner, isMember, isOver, loading,
    refresh, chooseTeam, leave, setTheme, update,
  };
};
