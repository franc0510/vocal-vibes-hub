import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import {
  ballotIsOpen,
  ballotIsSettled,
  DEFAULT_TIMEZONE,
} from "@/lib/competitionClock";
import type { CompetitionDay } from "./useCompetition";

/**
 * L'urne d'une journée : ses anecdotes, les voix, et la mienne.
 *
 * Une voix par personne et par jour — l'unicité `(day_id, voter_id)` en base
 * fait la règle, ce hook ne fait que la servir. Le dépouillement se lit de
 * l'heure et ne s'écrit nulle part : à 4 h, l'urne est scellée et les bonus
 * entrent au classement par la vue SQL, sans qu'aucun travail de fond n'ait à
 * tourner. Rien à planifier, rien qui puisse échouer une nuit.
 *
 * Le comptage des voix se fait ici, en JavaScript, comme dans `useWeeklyVocme`
 * : à l'échelle d'une journée de défi, quelques dizaines de lignes, c'est
 * moins cher qu'une vue de plus à tenir cohérente avec le reste.
 */

export interface BallotEntry {
  postId: string;
  userId: string;
  title: string;
  audioUrl: string;
  imageUrl: string | null;
  authorName: string;
  authorAvatar: string | null;
  votes: number;
  /** Vrai pour le·s gagnant·s d'une urne dépouillée. */
  isWinner: boolean;
  isMine: boolean;
}

interface PostRow {
  id: string;
  user_id: string;
  title: string | null;
  audio_url: string;
  image_url: string | null;
}

interface VoteRow {
  post_id: string;
  voter_id: string;
}

export const useCompetitionDayVote = (
  competitionId: string | undefined,
  day: CompetitionDay | null,
  timezone: string = DEFAULT_TIMEZONE
) => {
  const { user } = useAuth();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, { name: string; avatar: string | null }>>(new Map());
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const dayId = day?.id;

  const refresh = useCallback(async () => {
    if (!dayId) { setPosts([]); setVotes([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [postsRes, votesRes] = await Promise.all([
        db
          .from("voice_posts")
          .select("id, user_id, title, audio_url, image_url")
          .eq("competition_day_id", dayId)
          .order("created_at", { ascending: true }),
        db.from("competition_votes").select("post_id, voter_id").eq("day_id", dayId),
      ]);

      const rows = (postsRes.data ?? []) as PostRow[];
      setPosts(rows);
      setVotes((votesRes.data ?? []) as VoteRow[]);

      const ids = [...new Set(rows.map((p) => p.user_id))];
      if (ids.length > 0) {
        const { data } = await db
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        setAuthors(
          new Map(
            ((data ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[])
              .map((p) => [p.id, { name: p.display_name ?? "Anonyme", avatar: p.avatar_url }])
          )
        );
      } else {
        setAuthors(new Map());
      }
    } finally {
      setLoading(false);
    }
  }, [dayId]);

  useEffect(() => { refresh(); }, [refresh]);

  /**
   * Les voix arrivent sous les yeux.
   *
   * Sans ça, deux personnes qui votent côte à côte verraient chacune un
   * compteur différent — et se demanderaient laquelle des deux a raison.
   */
  useEffect(() => {
    if (!dayId) return;
    const channel = supabase
      .channel(`competition_ballot:${dayId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_votes" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dayId, refresh]);

  const isOpen = Boolean(day && ballotIsOpen(day.date, new Date(), timezone));
  const isSettled = Boolean(day && ballotIsSettled(day.date, new Date(), timezone));

  const myVote = useMemo(
    () => votes.find((v) => v.voter_id === user?.id)?.post_id ?? null,
    [votes, user?.id]
  );

  /**
   * Le dépouillement, tel que l'écran doit le montrer.
   *
   * Il rejoue exactement ce que fait la vue SQL : le maximum de voix, et TOUS
   * les ex æquo gagnants. Un écran qui couronnerait une seule anecdote quand
   * la base en crédite deux ferait mentir le classement affiché juste en
   * dessous.
   *
   * Tant que l'urne est ouverte, personne n'est couronné : les voix peuvent
   * encore bouger, et désigner un « gagnant provisoire » inviterait à voter
   * pour celui qui mène.
   */
  const entries = useMemo<BallotEntry[]>(() => {
    const tally = new Map<string, number>();
    for (const v of votes) tally.set(v.post_id, (tally.get(v.post_id) ?? 0) + 1);
    const best = Math.max(0, ...[...tally.values()]);

    return posts
      .map((p) => {
        const count = tally.get(p.id) ?? 0;
        const author = authors.get(p.user_id);
        return {
          postId: p.id,
          userId: p.user_id,
          title: p.title ?? "Sans titre",
          audioUrl: p.audio_url,
          imageUrl: p.image_url,
          authorName: author?.name ?? "Anonyme",
          authorAvatar: author?.avatar ?? null,
          votes: count,
          isWinner: isSettled && count > 0 && count === best,
          isMine: p.user_id === user?.id,
        };
      })
      .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title));
  }, [posts, votes, authors, isSettled, user?.id]);

  const totalVotes = votes.length;

  /**
   * Voter, ou déplacer sa voix.
   *
   * Optimiste puis corrigé en cas de refus — le motif éprouvé de `WeeklyPage`.
   * Un vote qui attend l'aller-retour réseau donne l'impression que le bouton
   * n'a pas marché, et on le presse deux fois.
   */
  const castVote = useCallback(
    async (postId: string) => {
      if (!user || !competitionId || !dayId) return;
      const previous = votes;
      setVotes((current) => [
        ...current.filter((v) => v.voter_id !== user.id),
        { post_id: postId, voter_id: user.id },
      ]);
      const { error } = await db
        .from("competition_votes")
        .upsert(
          { competition_id: competitionId, day_id: dayId, voter_id: user.id, post_id: postId },
          { onConflict: "day_id,voter_id" }
        );
      if (error) {
        setVotes(previous);
        throw error;
      }
      await refresh();
    },
    [user, competitionId, dayId, votes, refresh]
  );

  /** Se raviser, tant que l'urne est ouverte. */
  const clearVote = useCallback(async () => {
    if (!user || !dayId) return;
    const previous = votes;
    setVotes((current) => current.filter((v) => v.voter_id !== user.id));
    const { error } = await db
      .from("competition_votes")
      .delete()
      .eq("day_id", dayId)
      .eq("voter_id", user.id);
    if (error) {
      setVotes(previous);
      throw error;
    }
    await refresh();
  }, [user, dayId, votes, refresh]);

  /** Mon anecdote du jour, s'il y en a une — de quoi refermer la boucle. */
  const myPostId = useMemo(
    () => posts.find((p) => p.user_id === user?.id)?.id ?? null,
    [posts, user?.id]
  );

  return {
    entries, myVote, myPostId, totalVotes,
    isOpen, isSettled, loading,
    castVote, clearVote, refresh,
  };
};
