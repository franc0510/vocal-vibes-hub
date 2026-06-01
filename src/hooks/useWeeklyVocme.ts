import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Weekly "VocMe of the Week" logic.
 *
 * Timeline (weeks run Monday 00:00 -> Sunday 23:59):
 *  - During the current week, users post VocMes.
 *  - The FOLLOWING week, those posts are open to voting.
 *  - The winner of the now-completed voting is crowned and shown with effects.
 *
 * `week_start` stored in vocme_votes = the Monday (YYYY-MM-DD) of the week the
 * voted posts belong to (the "target" week).
 */

export const mondayOf = (d: Date): Date => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  date.setDate(date.getDate() + diff);
  return date;
};

export const toDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export interface WeeklyState {
  /** Post id currently crowned VocMe of the week (or null). */
  winnerPostId: string | null;
  /** The week_start (date) we vote on right now (last week's posts). */
  votingWeekStart: string;
  /** The post the current user voted for this voting period (or null). */
  myVotePostId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useWeeklyVocme = (): WeeklyState => {
  const { user } = useAuth();
  const [winnerPostId, setWinnerPostId] = useState<string | null>(null);
  const [myVotePostId, setMyVotePostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentWeekStart = mondayOf(now);
  const votingWeek = new Date(currentWeekStart);
  votingWeek.setDate(votingWeek.getDate() - 7); // last week's posts
  const crownedWeek = new Date(currentWeekStart);
  crownedWeek.setDate(crownedWeek.getDate() - 14); // completed voting

  const votingWeekStart = toDateStr(votingWeek);
  const crownedWeekStart = toDateStr(crownedWeek);

  const refresh = useCallback(async () => {
    setLoading(true);

    // 1) Compute crowned winner = most-voted post for crownedWeekStart
    const { data: crownedVotes } = await (supabase as any)
      .from("vocme_votes")
      .select("post_id")
      .eq("week_start", crownedWeekStart);

    if (crownedVotes && crownedVotes.length > 0) {
      const tally = new Map<string, number>();
      for (const v of crownedVotes as any[]) {
        tally.set(v.post_id, (tally.get(v.post_id) || 0) + 1);
      }
      let best: string | null = null;
      let bestCount = -1;
      for (const [pid, count] of tally.entries()) {
        if (count > bestCount) { best = pid; bestCount = count; }
      }
      setWinnerPostId(best);
    } else {
      setWinnerPostId(null);
    }

    // 2) Current user's vote for the active voting period
    if (user) {
      const { data: myVote } = await (supabase as any)
        .from("vocme_votes")
        .select("post_id")
        .eq("voter_id", user.id)
        .eq("week_start", votingWeekStart)
        .maybeSingle();
      setMyVotePostId(myVote?.post_id || null);
    } else {
      setMyVotePostId(null);
    }

    setLoading(false);
  }, [user?.id, crownedWeekStart, votingWeekStart]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { winnerPostId, votingWeekStart, myVotePostId, loading, refresh };
};
