import { useCallback, useEffect, useMemo, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { competitionDate, DEFAULT_TIMEZONE } from "@/lib/competitionClock";
import type { Competition } from "./useCompetitions";

/**
 * Ce que chaque défi attend de moi, aujourd'hui.
 *
 * La liste des défis ne montrait qu'un nom et une durée : pour savoir quel
 * était le thème du jour, et lequel réclamait encore une anecdote, il fallait
 * ouvrir chaque défi l'un après l'autre. Le seul écran qui sert tous les
 * matins était donc celui qui en disait le moins.
 *
 * Trois requêtes pour l'ensemble, et non trois par défi : les jours de tous
 * les défis d'un coup, puis mes anecdotes de ces jours-là d'un coup. Le tri
 * fin se fait ici, parce que la date qui compte dépend du fuseau de CHAQUE
 * défi et qu'aucun filtre serveur ne peut l'exprimer.
 */

export type ChallengeState = "live" | "upcoming" | "over";

export interface ChallengeDigest {
  competition: Competition;
  state: ChallengeState;
  /** Le thème du jour, si le défi court. */
  theme: string | null;
  dayId: string | null;
  dayIndex: number | null;
  /** Vrai si j'ai déjà publié pour le jour en cours. */
  hasPosted: boolean;
  /** Ce défi attend une anecdote de moi, maintenant. */
  needsMe: boolean;
}

interface DayRow {
  id: string;
  day_index: number;
  theme: string;
  date: string;
  competition_id: string;
}

/**
 * L'état d'un défi, et ce qu'il attend de moi. Pur, donc vérifiable.
 *
 * `today` est la date de compétition — celle qui bascule à 4 h dans le fuseau
 * de l'organisateur — et non la date du téléphone : à 2 h du matin, un défi
 * dont c'est le dernier jour court encore.
 */
export function digestFor(
  competition: Competition,
  day: { id: string; day_index: number; theme: string } | null,
  hasPosted: boolean,
  today: string
): ChallengeDigest {
  const over = Boolean(competition.closed_at) || competition.ends_on < today;
  const state: ChallengeState = over
    ? "over"
    : competition.starts_on > today
    ? "upcoming"
    : "live";
  return {
    competition,
    state,
    theme: day?.theme ?? null,
    dayId: day?.id ?? null,
    dayIndex: day?.day_index ?? null,
    hasPosted,
    // Un défi n'attend quelque chose que s'il court, qu'il a un thème
    // aujourd'hui, et que je n'y ai pas encore répondu.
    needsMe: state === "live" && Boolean(day) && !hasPosted,
  };
}

export const useChallengeDigest = (competitions: Competition[]) => {
  const { user } = useAuth();
  const [days, setDays] = useState<DayRow[]>([]);
  const [postedDayIds, setPostedDayIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const ids = useMemo(
    () => competitions.map((c) => c.id).sort().join(","),
    [competitions]
  );

  const refresh = useCallback(async () => {
    if (!user || !ids) { setDays([]); setPostedDayIds(new Set()); setLoading(false); return; }
    setLoading(true);
    try {
      // Une fenêtre de deux jours en dates UTC : le jour qui compte dépend du
      // fuseau de chaque défi, donc aucun `.eq("date")` ne peut le trouver
      // côté serveur sans une requête par défi.
      const now = new Date();
      const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
      const to = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);

      const { data } = await db
        .from("competition_days")
        .select("id, day_index, theme, date, competition_id")
        .in("competition_id", ids.split(","))
        .gte("date", from)
        .lte("date", to);
      const rows = (data ?? []) as DayRow[];
      setDays(rows);

      if (rows.length === 0) { setPostedDayIds(new Set()); return; }
      const { data: mine } = await db
        .from("voice_posts")
        .select("competition_day_id")
        .eq("user_id", user.id)
        .in("competition_day_id", rows.map((d) => d.id));
      setPostedDayIds(
        new Set(((mine ?? []) as { competition_day_id: string }[]).map((p) => p.competition_day_id))
      );
    } finally {
      setLoading(false);
    }
  }, [user, ids]);

  useEffect(() => { refresh(); }, [refresh]);

  const digests = useMemo<ChallengeDigest[]>(() => {
    const now = new Date();
    return competitions.map((c) => {
      const today = competitionDate(now, c.timezone ?? DEFAULT_TIMEZONE);
      const day = days.find((d) => d.competition_id === c.id && d.date === today) ?? null;
      return digestFor(c, day, day ? postedDayIds.has(day.id) : false, today);
    });
  }, [competitions, days, postedDayIds]);

  return { digests, loading, refresh };
};

/**
 * L'ordre dans lequel les défis se lisent.
 *
 * Ceux qui réclament une anecdote d'abord : c'est la seule raison d'ouvrir
 * cet écran un matin. Le reste suit, et ce qui est fini passe en dernier.
 */
export const sortDigests = (digests: ChallengeDigest[]): ChallengeDigest[] =>
  [...digests].sort((a, b) => {
    if (a.needsMe !== b.needsMe) return a.needsMe ? -1 : 1;
    return a.competition.ends_on.localeCompare(b.competition.ends_on);
  });
