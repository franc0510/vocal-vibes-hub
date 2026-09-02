import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { competitionDate, DEFAULT_TIMEZONE } from "@/lib/competitionClock";

/**
 * Le thème du jour, servi par la base.
 *
 * Il remplace `DAILY_TOPICS`, sept phrases en anglais codées en dur dans
 * `RecordPage` et indexées sur le jour de la semaine. Elles ne pouvaient pas
 * changer sans une publication sur l'App Store, et s'affichaient en anglais
 * dans une application française.
 *
 * Le jour est ensuite stocké sur l'anecdote plutôt que déduit de sa date : ça
 * règle d'un coup le fuseau horaire et la publication à 00h05.
 *
 * Le jour retenu est celui de la compétition, pas celui du téléphone : chaque
 * compétition a son fuseau, et sa journée bascule à 4 h du matin. Interroger
 * une date unique en UTC, comme avant, faisait disparaître le thème une partie
 * de la nuit — et proposait le thème de demain à qui publiait à 00 h 30.
 */

export interface TodayTheme {
  dayId: string;
  dayIndex: number;
  theme: string;
  competitionId: string;
  competitionName: string;
}

export const useTodayTheme = (preferredDayId?: string | null) => {
  const { user } = useAuth();
  const [themes, setThemes] = useState<TodayTheme[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setThemes([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data: memberships } = await db
        .from("competition_members")
        .select("competition_id")
        .eq("user_id", user.id);
      const ids = (memberships ?? []).map((m: { competition_id: string }) => m.competition_id);
      if (ids.length === 0) { setThemes([]); return; }

      // Deux jours autour de maintenant, puis le tri se fait ici : la date qui
      // compte dépend du fuseau de CHAQUE compétition, donc aucun `.eq("date")`
      // ne peut la trouver côté serveur sans une requête par compétition.
      const now = new Date();
      const utcToday = now.toISOString().slice(0, 10);
      const utcYesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

      const { data } = await db
        .from("competition_days")
        .select("id, day_index, theme, date, competition_id, competitions(name, timezone)")
        .in("competition_id", ids)
        .in("date", [utcYesterday, utcToday]);

      type Row = {
        id: string; day_index: number; theme: string; date: string; competition_id: string;
        competitions?: { name: string; timezone: string | null } | null;
      };

      setThemes(
        ((data ?? []) as Row[])
          .filter(
            (d) =>
              d.date ===
              competitionDate(now, d.competitions?.timezone ?? DEFAULT_TIMEZONE)
          )
          .map((d) => ({
            dayId: d.id,
            dayIndex: d.day_index,
            theme: d.theme,
            competitionId: d.competition_id,
            competitionName: d.competitions?.name ?? "",
          }))
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  /**
   * Celui qu'on propose par défaut.
   *
   * Le lien depuis l'écran d'un défi en désigne un ; sinon on prend le premier.
   * Ce n'est qu'une PROPOSITION : l'écran d'enregistrement la montre et permet
   * d'en changer ou de la refuser. Auparavant elle s'appliquait en silence, si
   * bien que le moindre enregistrement partait dans un défi choisi au hasard
   * parmi ceux en cours, sans qu'on puisse s'y opposer.
   */
  const active =
    themes.find((t) => t.dayId === preferredDayId) ?? themes[0] ?? null;

  return { themes, active, loading, refresh: load };
};
