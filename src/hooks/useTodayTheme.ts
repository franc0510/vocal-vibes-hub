import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";

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

      const today = new Date().toISOString().slice(0, 10);
      const { data } = await db
        .from("competition_days")
        .select("id, day_index, theme, competition_id, competitions(name)")
        .in("competition_id", ids)
        .eq("date", today);

      setThemes(
        (data ?? []).map((d: {
          id: string; day_index: number; theme: string; competition_id: string;
          competitions?: { name: string } | null;
        }) => ({
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
   * Celui qu'on propose.
   *
   * Le lien depuis l'écran d'une compétition en désigne un ; sinon on prend le
   * premier. Jouer dans deux défis le même jour reste rare, et proposer un
   * choix avant même d'avoir enregistré ajouterait un écran pour rien.
   */
  const active =
    themes.find((t) => t.dayId === preferredDayId) ?? themes[0] ?? null;

  return { themes, active, loading, refresh: load };
};
