import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { canChangeTeam, canEditDay, type ScoringWeights } from "@/lib/competitionScoring";
import { competitionDate, DEFAULT_TIMEZONE } from "@/lib/competitionClock";
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

  /**
   * Aujourd'hui, vu de la compétition.
   *
   * Dans son fuseau, et avec la bascule à 4 h du matin : à 1 h, la journée
   * d'hier court encore. L'ancien `new Date().toISOString().slice(0, 10)`
   * rendait la date UTC et faisait sauter le thème une partie de la nuit.
   */
  const today = competitionDate(
    new Date(),
    competition?.timezone ?? DEFAULT_TIMEZONE
  );

  /** Le jour en cours, ou rien si la compétition n'a pas commencé ou est finie. */
  const currentDay = days.find((d) => d.date === today) ?? null;

  const isOwner = Boolean(user && competition && competition.owner_id === user.id);
  const isMember = Boolean(membership);
  const isOver = Boolean(competition && competition.ends_on < today);
  /** Le barème ne se règle que tant que rien n'est joué. */
  const canEditScoring = Boolean(competition && competition.starts_on > today);

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
        throw new Error("You already picked your team — that choice is final.");
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
      if (!canEditDay(day.date, today)) {
        throw new Error("This day has started — its theme can no longer change.");
      }
      const { error } = await db.from("competition_days").update({ theme }).eq("id", dayId);
      if (error) throw error;
      await refresh();
    },
    [days, today, refresh]
  );

  /**
   * Régler la compétition — barème compris, tant qu'elle n'a pas commencé.
   *
   * Un trigger en base applique la même règle sur `scoring` : changer un
   * coefficient en cours de route rebat rétroactivement tout un classement
   * doté d'un lot. Le garde-fou d'ici évite seulement de proposer un champ
   * que le serveur refusera.
   */
  const update = useCallback(
    async (
      patch: Partial<
        Pick<Competition, "name" | "description" | "prize" | "visibility"> & {
          scoring: ScoringWeights;
        }
      >
    ) => {
      if (!competitionId) return;
      if (patch.scoring && !canEditScoring) {
        throw new Error("Scoring is frozen once the challenge has started.");
      }
      const { error } = await db.from("competitions").update(patch).eq("id", competitionId);
      if (error) throw error;
      await refresh();
    },
    [competitionId, canEditScoring, refresh]
  );

  /**
   * Ajouter un jour, après la création.
   *
   * Il n'existait aucun chemin pour ça, et une compétition dont les jours
   * avaient échoué à la création était donc définitivement inutilisable — sans
   * thème, sans urne, sans rien. C'est exactement ce qu'a rencontré le premier
   * testeur. La politique « Owners add days » l'autorise depuis que la date
   * exigée est `>= aujourd'hui` et non `>`.
   *
   * `ends_on` suit : la durée n'est pas un réglage, c'est le nombre de jours.
   */
  const addDay = useCallback(
    async (theme: string, date: string) => {
      if (!competitionId) return;
      const nextIndex = days.reduce((max, d) => Math.max(max, d.day_index), 0) + 1;
      const { error } = await db
        .from("competition_days")
        .insert({ competition_id: competitionId, day_index: nextIndex, theme: theme.trim(), date });
      if (error) throw error;
      if (!competition || date > competition.ends_on) {
        await db.from("competitions").update({ ends_on: date }).eq("id", competitionId);
      }
      await refresh();
    },
    [competitionId, competition, days, refresh]
  );

  /**
   * Les équipes, après la création.
   *
   * Elles n'étaient réglables qu'au moment de créer : un organisateur qui
   * découvrait une faute de frappe ou une troisième classe devait recommencer
   * la compétition. La politique « Owners manage teams » les autorisait déjà,
   * il manquait le chemin.
   */
  const addTeam = useCallback(
    async (name: string, color: string | null) => {
      if (!competitionId) return;
      const { error } = await db
        .from("competition_teams")
        .insert({ competition_id: competitionId, name: name.trim(), color });
      if (error) throw error;
      await refresh();
    },
    [competitionId, refresh]
  );

  const renameTeam = useCallback(
    async (teamId: string, name: string, color?: string | null) => {
      const patch: { name: string; color?: string | null } = { name: name.trim() };
      if (color !== undefined) patch.color = color;
      const { error } = await db.from("competition_teams").update(patch).eq("id", teamId);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  /**
   * Supprimer une équipe ne supprime personne : `team_id` est
   * `ON DELETE SET NULL`, donc ses joueurs repassent en solo avec leurs points.
   * L'écran doit le dire avant de demander confirmation.
   */
  const removeTeam = useCallback(
    async (teamId: string) => {
      const { error } = await db.from("competition_teams").delete().eq("id", teamId);
      if (error) throw error;
      await refresh();
    },
    [refresh]
  );

  return {
    competition, teams, days, membership, currentDay, today,
    isOwner, isMember, isOver, canEditScoring, loading,
    refresh, chooseTeam, leave, setTheme, update, addDay,
    addTeam, renameTeam, removeTeam,
  };
};
