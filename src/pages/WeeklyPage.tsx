import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, Play, Pause, ChevronLeft, Trophy, Vote, Sparkles, Heart, MessageCircle, Gauge } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWeeklyVocme, toDateStr } from "@/hooks/useWeeklyVocme";
import { playExclusive, releaseAudio } from "@/lib/audioManager";

interface WeeklyPost {
  id: string;
  title: string;
  audio_url: string;
  image_url: string | null;
  duration: number;
  created_at: string;
  author_name: string;
  author_avatar: string | null;
  votes: number;
  likes: number;
  comments: number;
}

const MiniPlayer = ({ url }: { url: string }) => {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<HTMLAudioElement | null>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ref.current) {
      ref.current = new Audio(url);
      ref.current.onended = () => { setPlaying(false); releaseAudio(ref.current); };
      ref.current.onpause = () => setPlaying(false);
      ref.current.onplay = () => setPlaying(true);
    }
    ref.current.playbackRate = speed;
    if (playing) { ref.current.pause(); releaseAudio(ref.current); }
    else { playExclusive(ref.current); }
  };
  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpeed((prev) => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (ref.current) ref.current.playbackRate = next;
      return next;
    });
  };
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={toggle} className="w-10 h-10 rounded-full gradient-red flex items-center justify-center shadow-red shrink-0">
        {playing ? <Pause size={16} className="text-primary-foreground" /> : <Play size={16} className="text-primary-foreground ml-0.5" />}
      </button>
      <button
        onClick={cycleSpeed}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full border transition-colors ${speed > 1 ? "bg-primary/20 border-primary/50 text-primary" : "bg-secondary border-border/30 text-muted-foreground"}`}
      >
        <Gauge size={11} />
        <span className="text-[10px] font-bold">{speed}x</span>
      </button>
    </div>
  );
};

const WeeklyPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { winnerPostId, votingWeekStart, myVotePostId, refresh } = useWeeklyVocme();

  const [candidates, setCandidates] = useState<WeeklyPost[]>([]);
  const [winner, setWinner] = useState<WeeklyPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFallback, setIsFallback] = useState(false);
  const [myVote, setMyVote] = useState<string | null>(myVotePostId);

  useEffect(() => { setMyVote(myVotePostId); }, [myVotePostId]);

  const enrich = useCallback(async (rows: any[]): Promise<WeeklyPost[]> => {
    if (!rows || rows.length === 0) return [];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles").select("id, display_name, avatar_url").in("id", userIds);
    const pMap = new Map((profiles || []).map((p) => [p.id, p]));

    const ids = rows.map((r) => r.id);
    const [{ data: votes }, { data: likes }, { data: comments }] = await Promise.all([
      (supabase as any)
        .from("vocme_votes").select("post_id").in("post_id", ids).eq("week_start", votingWeekStart),
      supabase.from("voice_post_likes").select("post_id").in("post_id", ids),
      supabase.from("comments").select("post_id").in("post_id", ids),
    ]);
    const tally = new Map<string, number>();
    for (const v of (votes || []) as any[]) tally.set(v.post_id, (tally.get(v.post_id) || 0) + 1);
    const likeTally = new Map<string, number>();
    for (const l of (likes || []) as any[]) likeTally.set(l.post_id, (likeTally.get(l.post_id) || 0) + 1);
    const commentTally = new Map<string, number>();
    for (const c of (comments || []) as any[]) commentTally.set(c.post_id, (commentTally.get(c.post_id) || 0) + 1);

    return rows.map((r) => {
      const p = pMap.get(r.user_id);
      return {
        id: r.id,
        title: r.title,
        audio_url: r.audio_url,
        image_url: (r as any).image_url || null,
        duration: r.duration,
        created_at: r.created_at,
        author_name: p?.display_name || "User",
        author_avatar: p?.avatar_url || null,
        votes: tally.get(r.id) || 0,
        likes: likeTally.get(r.id) || 0,
        comments: commentTally.get(r.id) || 0,
      };
    }).sort((a, b) => b.votes - a.votes);
  }, [votingWeekStart]);

  const load = useCallback(async () => {
    setLoading(true);

    // Candidates = public posts created during the voting target week
    const weekStartDate = new Date(votingWeekStart);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 7);

    const { data: rows } = await supabase
      .from("voice_posts")
      .select("*")
      .gte("created_at", weekStartDate.toISOString())
      .lt("created_at", weekEndDate.toISOString())
      .order("created_at", { ascending: false });

    // Only public posts (no group)
    const publicRows = (rows || []).filter((r: any) => !r.group_id);
    let enriched = await enrich(publicRows);

    // Fallback: if there were no VocMes last week, surface ~10 varied public
    // VocMes (max 2 per author) so the voting page is never empty.
    if (enriched.length === 0) {
      setIsFallback(true);
      const { data: anyRows } = await supabase
        .from("voice_posts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);
      const publicAny = (anyRows || []).filter((r: any) => !r.group_id);
      const perAuthor = new Map<string, number>();
      const varied: any[] = [];
      for (const r of publicAny) {
        const c = perAuthor.get(r.user_id) || 0;
        if (c >= 2) continue;
        perAuthor.set(r.user_id, c + 1);
        varied.push(r);
        if (varied.length >= 10) break;
      }
      // Shuffle for variety
      for (let i = varied.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [varied[i], varied[j]] = [varied[j], varied[i]];
      }
      enriched = await enrich(varied);
    } else {
      setIsFallback(false);
    }

    setCandidates(enriched);

    // Winner detail
    if (winnerPostId) {
      const { data: wRow } = await supabase.from("voice_posts").select("*").eq("id", winnerPostId).maybeSingle();
      if (wRow) {
        const [w] = await enrich([wRow]);
        setWinner(w || null);
      }
    } else {
      setWinner(null);
    }

    setLoading(false);
  }, [votingWeekStart, winnerPostId, enrich]);

  useEffect(() => { load(); }, [load]);

  const castVote = async (postId: string) => {
    if (!user) { toast.error("Sign in to vote"); return; }
    const previous = myVote;

    // Optimistic
    setMyVote(postId);
    setCandidates((prev) => prev.map((c) => {
      if (c.id === postId) return { ...c, votes: c.votes + 1 };
      if (c.id === previous) return { ...c, votes: Math.max(0, c.votes - 1) };
      return c;
    }).sort((a, b) => b.votes - a.votes));

    try {
      // Upsert vote on the unique (voter_id, week_start)
      const { error } = await (supabase as any)
        .from("vocme_votes")
        .upsert(
          { voter_id: user.id, post_id: postId, week_start: votingWeekStart },
          { onConflict: "voter_id,week_start" }
        );
      if (error) throw error;
      toast.success("Vote counted! 🗳️");
      refresh();
    } catch (err: any) {
      // Revert
      setMyVote(previous);
      toast.error("Vote failed");
      load();
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-y-auto"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
        paddingBottom: "100px",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <header className="flex items-center gap-3 mb-4 shrink-0">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold font-display text-gradient-red flex items-center gap-2">
            <Crown size={20} className="text-amber-400 fill-amber-400" />
            Anecdote of the Week
          </h1>
          <p className="text-xs text-muted-foreground">Vote for last week's best VocMe 🎤</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Crowned winner */}
          {winner && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative rounded-2xl overflow-hidden mb-6 border-2 border-amber-400/60"
            >
              <div className="absolute inset-0">
                {winner.image_url ? (
                  <img src={winner.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full gradient-red" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-amber-500/30" />
              </div>
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ boxShadow: "inset 0 0 60px rgba(251,191,36,0.5)" }}
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
              <div className="relative p-5">
                <div className="flex items-center gap-1.5 mb-2">
                  <Trophy size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-amber-300 uppercase tracking-wide">Reigning Champion</span>
                  <Sparkles size={14} className="text-amber-400" />
                </div>
                <div className="flex items-center gap-3">
                  {winner.author_avatar ? (
                    <img src={winner.author_avatar} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-amber-400" />
                  ) : (
                    <div className="w-12 h-12 rounded-full gradient-red flex items-center justify-center border-2 border-amber-400">
                      <Crown size={18} className="text-amber-200" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      {winner.author_name}
                      <Crown size={13} className="text-amber-400 fill-amber-400" />
                    </p>
                    <button onClick={() => navigate(`/post/${winner.id}`)} className="block w-full text-left">
                      <p className="text-sm text-foreground/90 truncate hover:text-primary transition-colors">{winner.title}</p>
                    </button>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-xs text-amber-300/90 font-medium">{winner.votes} vote{winner.votes !== 1 ? "s" : ""}</p>
                      <span className="flex items-center gap-1 text-xs text-foreground/70"><Heart size={11} className="text-primary" />{winner.likes}</span>
                      <button
                        onClick={() => navigate(`/post/${winner.id}`)}
                        className="flex items-center gap-1 text-xs text-foreground/70 hover:text-primary transition-colors"
                      >
                        <MessageCircle size={11} />{winner.comments}
                      </button>
                    </div>
                  </div>
                  <MiniPlayer url={winner.audio_url} />
                </div>
              </div>
            </motion.div>
          )}

          {/* Voting section */}
          <div className="flex items-center gap-2 mb-3">
            <Vote size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              {isFallback ? "Vote now — featured VocMes" : "Vote now — last week's VocMes"}
            </h2>
          </div>

          {candidates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No VocMes from last week to vote on yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Post VocMes this week to compete next week!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((c, idx) => {
                const isMine = myVote === c.id;
                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      isMine ? "bg-primary/10 border-primary/50" : "bg-card border-border/40"
                    }`}
                  >
                    <div className="relative shrink-0">
                      {idx === 0 && c.votes > 0 && (
                        <Crown size={14} className="absolute -top-2 -right-1 text-amber-400 fill-amber-400 z-10" />
                      )}
                      <MiniPlayer url={c.audio_url} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => navigate(`/post/${c.id}`)} className="block w-full text-left">
                        <p className="text-sm font-medium text-foreground truncate hover:text-primary transition-colors">{c.title}</p>
                      </button>
                      <p className="text-xs text-muted-foreground truncate">{c.author_name}</p>
                      <div className="flex items-center gap-2.5 mt-0.5">
                        <span className="flex items-center gap-0.5 text-[11px] text-amber-400 font-medium"><Crown size={10} className="fill-amber-400" />{c.votes}</span>
                        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground"><Heart size={10} className="text-primary" />{c.likes}</span>
                        <button
                          onClick={() => navigate(`/post/${c.id}`)}
                          className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                        >
                          <MessageCircle size={10} />{c.comments}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => castVote(c.id)}
                      disabled={isMine}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-colors ${
                        isMine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/70"
                      }`}
                    >
                      {isMine ? "Voted ✓" : "Vote"}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WeeklyPage;
