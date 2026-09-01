import { useCallback, useEffect, useState } from "react";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import { TEMPLATES, fromTemplate, type CompetitionTemplate } from "@/lib/competitionTemplates";
import { competitionDate, DEFAULT_TIMEZONE } from "@/lib/competitionClock";
import { DEFAULT_WEIGHTS, type ScoringWeights } from "@/lib/competitionScoring";

/**
 * La liste des compétitions : les miennes, les publiques ouvertes, et la
 * création.
 *
 * Les types générés de Supabase ne connaissent pas encore ces tables, d'où les
 * `as any` — même convention que `useWeeklyVocme`.
 */

export interface Competition {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  prize: string | null;
  visibility: "public" | "private";
  starts_on: string;
  ends_on: string;
  /** Le fuseau qui décide des jours. En base depuis le début, jamais lu. */
  timezone: string;
  join_code: string | null;
  template_key: string | null;
  closed_at: string | null;
  scoring: Record<string, number>;
  final_standings: unknown | null;
}

/**
 * La date du jour pour la liste, sans compétition sous la main.
 *
 * On ne connaît pas encore le fuseau de chacune, alors on prend celui du
 * défaut : ce filtre-ci ne sert qu'à écarter les compétitions terminées depuis
 * longtemps, et une heure d'écart n'en cache aucune. Les écrans qui décident
 * vraiment d'un jour, eux, lisent `competition.timezone`.
 */
const listDate = () => competitionDate(new Date(), DEFAULT_TIMEZONE);

/** Un code court, lisible au téléphone : ni 0/O ni 1/I. */
const makeJoinCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    alphabet[Math.floor(Math.random() * alphabet.length)]
  ).join("");
};

export const useCompetitions = () => {
  const { user } = useAuth();
  const [mine, setMine] = useState<Competition[]>([]);
  const [open, setOpen] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // Les compétitions où je joue. La politique RLS laisse déjà passer les
      // privées dont je suis membre, donc aucun filtre de visibilité ici.
      let joined: Competition[] = [];
      if (user) {
        const { data: memberships } = await db
          .from("competition_members")
          .select("competition_id")
          .eq("user_id", user.id);
        const ids = (memberships ?? []).map((m: { competition_id: string }) => m.competition_id);
        if (ids.length > 0) {
          const { data } = await db
            .from("competitions")
            .select("*")
            .in("id", ids)
            .order("ends_on", { ascending: false });
          joined = (data ?? []) as Competition[];
        }
      }
      setMine(joined);

      // Les publiques encore ouvertes, celles que je n'ai pas rejointes en tête.
      const { data: publics } = await db
        .from("competitions")
        .select("*")
        .eq("visibility", "public")
        .gte("ends_on", listDate())
        .order("starts_on", { ascending: true });
      const joinedIds = new Set(joined.map((c) => c.id));
      setOpen(((publics ?? []) as Competition[]).filter((c) => !joinedIds.has(c.id)));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Crée une compétition, ses équipes et ses jours.
   *
   * Un modèle est copié, pas référencé : `template_key` ne sert qu'à dire d'où
   * elle vient. Tout reste modifiable ensuite.
   */
  const create = useCallback(
    async (input: {
      name: string;
      description?: string;
      prize?: string;
      visibility: "public" | "private";
      startsOn: Date;
      template?: CompetitionTemplate | null;
      teams?: { name: string; color: string }[];
      days?: { day_index: number; theme: string }[];
      /** Le barème choisi à la création. Après le départ, il est gelé. */
      scoring?: ScoringWeights;
    }) => {
      if (!user) throw new Error("Il faut être connecté pour créer une compétition.");
      const template = input.template ?? null;
      const seed = template ? fromTemplate(template, input.startsOn) : null;

      const days = input.days ?? seed?.days ?? [];
      const dated = days.map((d) => {
        const date = new Date(input.startsOn);
        date.setDate(date.getDate() + d.day_index - 1);
        return { day_index: d.day_index, theme: d.theme, date: date.toISOString().slice(0, 10) };
      });
      if (dated.length === 0) throw new Error("Une compétition a besoin d'au moins un jour.");

      const { data: created, error } = await db
        .from("competitions")
        .insert({
          owner_id: user.id,
          name: input.name,
          description: input.description ?? seed?.description ?? null,
          prize: input.prize ?? null,
          visibility: input.visibility,
          starts_on: input.startsOn.toISOString().slice(0, 10),
          // La durée n'est pas un réglage : c'est le nombre de jours.
          ends_on: dated[dated.length - 1].date,
          // L'écran de création propose déjà un barème, pré-rempli depuis le
          // modèle : c'est lui qui fait foi, le modèle n'étant qu'un point de
          // départ. Sans écran (script, API), on retombe sur le modèle.
          scoring: input.scoring ?? seed?.scoring ?? DEFAULT_WEIGHTS,
          template_key: template?.key ?? null,
          // Une privée sans code ne se partage que nommément ; en donner un
          // coûte une colonne et évite d'inviter cinquante personnes à la main.
          join_code: input.visibility === "private" ? makeJoinCode() : null,
        })
        .select("*")
        .single();
      if (error) throw error;

      const teams = input.teams ?? seed?.teams ?? [];
      if (teams.length > 0) {
        await db.from("competition_teams").insert(
          teams.map((t) => ({ competition_id: created.id, name: t.name, color: t.color }))
        );
      }
      await db.from("competition_days").insert(
        dated.map((d) => ({ ...d, competition_id: created.id }))
      );
      // Le créateur est membre : sinon il ne voit pas sa propre compétition
      // privée, la politique de lecture ne parlant que des membres et de lui.
      await db
        .from("competition_members")
        .insert({ competition_id: created.id, user_id: user.id, role: "owner" });

      await refresh();
      return created as Competition;
    },
    [user, refresh]
  );

  /** Rejoint une compétition publique, ou une privée par son code. */
  const join = useCallback(
    async (competitionId: string, teamId?: string | null) => {
      if (!user) throw new Error("Il faut être connecté pour rejoindre.");
      const { error } = await db
        .from("competition_members")
        .insert({ competition_id: competitionId, user_id: user.id, team_id: teamId ?? null });
      if (error) throw error;
      await refresh();
    },
    [user, refresh]
  );

  const findByCode = useCallback(async (code: string) => {
    const { data } = await db
      .from("competitions")
      .select("*")
      .eq("join_code", code.trim().toUpperCase())
      .maybeSingle();
    return (data ?? null) as Competition | null;
  }, []);

  return { mine, open, loading, refresh, create, join, findByCode, templates: TEMPLATES };
};
