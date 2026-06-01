import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Play, Pause, X, Heart, MessageCircle, Share2, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import CommentsPanel from "@/components/CommentsPanel";
import SharePanel from "@/components/SharePanel";
import { useAuth } from "@/contexts/AuthContext";
import { playExclusive, releaseAudio } from "@/lib/audioManager";

interface UserResult {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
}

interface ExplorePost {
  id: string;
  title: string;
  audio_url: string;
  duration: number;
  created_at: string;
  likes_count: number;
  comments_count: number;
  user_id: string;
  author_name: string;
  author_avatar_url: string | null;
}

const generateWaveform = () => Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.85);
const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 1) return `${Math.floor(diff / 60000)}m`;
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

// Explore tile — user avatar instead of play icon
const ExploreTile = ({ post, onSelect }: { post: ExplorePost; onSelect: () => void }) => {
  const initials = (post.author_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      onClick={onSelect}
      className="aspect-square bg-card border border-border/30 rounded-xl flex flex-col items-center justify-center p-2 hover:bg-primary/5 transition-colors relative overflow-hidden"
    >
      {post.author_avatar_url ? (
        <img src={post.author_avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-primary/30 mb-1.5" />
      ) : (
        <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center mb-1.5 text-xs font-bold text-primary-foreground">
          {initials}
        </div>
      )}
      <p className="text-[10px] text-foreground font-medium text-center line-clamp-2 leading-tight px-1">{post.title}</p>
      <p className="text-[9px] text-muted-foreground mt-0.5">{formatDuration(post.duration)}</p>
    </button>
  );
};

// Full post player overlay with like, comment, share
const ExplorePostPlayer = ({ post, onClose }: { post: ExplorePost; onClose: () => void }) => {
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [commentCount, setCommentCount] = useState(post.comments_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveform = useRef(generateWaveform()).current;
  const navigate = useNavigate();

  // Check if user already liked
  useEffect(() => {
    if (!user) return;
    supabase
      .from("voice_post_likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("post_id", post.id)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [user?.id, post.id]);

  // Fetch actual counts
  useEffect(() => {
    Promise.all([
      supabase.from("voice_post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
    ]).then(([likesRes, commentsRes]) => {
      if (likesRes.count !== null) setLikeCount(likesRes.count);
      if (commentsRes.count !== null) setCommentCount(commentsRes.count);
    });
  }, [post.id]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        releaseAudio(audioRef.current);
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      releaseAudio(audioRef.current);
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
    onClose();
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpeed((prev) => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  };

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audio_url);
      audioRef.current.onended = () => { setPlaying(false); releaseAudio(audioRef.current); };
    }
    audioRef.current.playbackRate = speed;
    if (playing) { audioRef.current.pause(); releaseAudio(audioRef.current); }
    else playExclusive(audioRef.current);
    setPlaying(!playing);
  };

  const toggleLike = async () => {
    if (!user) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);
    try {
      if (newLiked) await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: post.id });
      else await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", post.id);
      const { count } = await supabase.from("voice_post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id);
      if (count !== null) setLikeCount(count);
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => newLiked ? c - 1 : c + 1);
    }
  };

  const initials = (post.author_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="w-full max-w-sm bg-card rounded-2xl p-5 border border-border/50 shadow-elevated"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground font-display">{post.title}</h3>
            <button onClick={handleClose} className="text-muted-foreground"><X size={18} /></button>
          </div>

          {/* Author info */}
          <button
            onClick={() => { handleClose(); navigate(`/user/${post.user_id}`); }}
            className="flex items-center gap-2 mb-4"
          >
            {post.author_avatar_url ? (
              <img src={post.author_avatar_url} alt="" className="w-8 h-8 rounded-full object-cover border border-border/30" />
            ) : (
              <div className="w-8 h-8 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                {initials}
              </div>
            )}
            <span className="text-xs text-muted-foreground">{post.author_name} · {formatTime(post.created_at)}</span>
          </button>

          {/* Audio player */}
          <div
            className="flex items-center gap-3 bg-secondary/60 rounded-xl p-4 cursor-pointer"
            onClick={toggle}
          >
            <button className="w-11 h-11 rounded-full gradient-red flex items-center justify-center text-primary-foreground shrink-0 shadow-red">
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="flex-1 overflow-hidden h-10">
              <WaveformVisualizer bars={waveform} isPlaying={playing} size="md" />
            </div>
            <button
              onClick={cycleSpeed}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border shrink-0 transition-colors ${speed > 1 ? "bg-primary/20 border-primary/50 text-primary" : "bg-card border-border/30 text-muted-foreground"}`}
            >
              <Gauge size={13} />
              <span className="text-xs font-bold">{speed}x</span>
            </button>
          </div>

          {/* Stats: like, comment, share */}
          <div className="flex items-center justify-around mt-4 pt-3 border-t border-border/30">
            <button onClick={toggleLike} className="flex items-center gap-1.5">
              <Heart size={18} className={liked ? "fill-primary text-primary" : "text-muted-foreground"} />
              <span className={`text-xs font-medium ${liked ? "text-primary" : "text-muted-foreground"}`}>{likeCount}</span>
            </button>
            <button onClick={() => setCommentsOpen(true)} className="flex items-center gap-1.5">
              <MessageCircle size={18} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">{commentCount}</span>
            </button>
            <button onClick={() => setShareOpen(true)} className="flex items-center gap-1.5">
              <Share2 size={18} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Share</span>
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-3 text-center">{formatDuration(post.duration)}</p>
        </motion.div>
      </motion.div>

      <CommentsPanel
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        onCommentAdded={() => setCommentCount((c) => c + 1)}
      />
      <SharePanel
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        postTitle={post.title}
        postAuthor={post.author_name}
      />
    </>
  );
};

const SearchPage = () => {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [explorePosts, setExplorePosts] = useState<ExplorePost[]>([]);
  const [exploreLoading, setExploreLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ExplorePost | null>(null);
  const navigate = useNavigate();

  // Fetch random public VocMes on mount
  useEffect(() => {
    const loadExplore = async () => {
      setExploreLoading(true);

      // Get public posts (no group_id) ordered randomly-ish
      const { data: postsData } = await supabase
        .from("voice_posts")
        .select("*")
        .is("group_id" as any, null)
        .order("created_at", { ascending: false })
        .limit(60);

      if (!postsData || postsData.length === 0) {
        setExplorePosts([]);
        setExploreLoading(false);
        return;
      }

      // Shuffle
      const shuffled = [...postsData].sort(() => Math.random() - 0.5);

      // Enrich with author info
      const authorIds = [...new Set(shuffled.map((p) => p.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", authorIds);
      const pMap = new Map((profiles || []).map((p) => [p.id, p]));

      const enriched: ExplorePost[] = shuffled.map((p) => {
        const author = pMap.get(p.user_id);
        return {
          id: p.id,
          title: p.title,
          audio_url: p.audio_url,
          duration: p.duration,
          created_at: p.created_at,
          likes_count: p.likes_count ?? 0,
          comments_count: p.comments_count ?? 0,
          user_id: p.user_id,
          author_name: author?.display_name || "User",
          author_avatar_url: author?.avatar_url || null,
        };
      });

      setExplorePosts(enriched);
      setExploreLoading(false);
    };
    loadExplore();
  }, []);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setUsers([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    // Search users
    const { data: usersData } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(10);

    setUsers((usersData as UserResult[]) || []);

    // Filter explore posts by title match
    if (q.length >= 2) {
      const filtered = explorePosts.filter((p) =>
        p.title.toLowerCase().includes(q.toLowerCase()) ||
        p.author_name.toLowerCase().includes(q.toLowerCase())
      );
      // If we have filtered results, show them; otherwise keep all
      if (filtered.length > 0) {
        setExplorePosts((prev) => [...filtered, ...prev.filter((p) => !filtered.find((f) => f.id === p.id))]);
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen pb-24 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
      <header className="mb-4">
        <h1 className="text-2xl font-bold font-display text-gradient-red mb-3">Explore</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search users or voice stories..."
            className="w-full bg-card border border-border/50 rounded-xl pl-10 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
          />
        </div>
      </header>

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* User search results */}
      {!loading && searched && users.length > 0 && (
        <div className="mb-5">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Users</h2>
          <div className="space-y-1">
            {users.map((u) => {
              const initials = (u.display_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <motion.button
                  key={u.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => navigate(`/user/${u.id}`)}
                  className="w-full flex items-center gap-3 bg-card rounded-xl p-3 border border-border/50 hover:bg-primary/5 transition-colors text-left"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {initials}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">{u.display_name}</p>
                    {u.username && <p className="text-xs text-muted-foreground">@{u.username}</p>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {!loading && searched && users.length === 0 && explorePosts.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">No results for "{query}"</p>
      )}

      {/* Explore grid */}
      {!loading && (
        <div>
          {searched && <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">VocMes</h2>}
          {exploreLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : explorePosts.length === 0 ? (
            <div className="text-center py-16">
              <Search size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No public VocMes yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {explorePosts.map((post) => (
                <ExploreTile key={post.id} post={post} onSelect={() => setSelectedPost(post)} />
              ))}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {selectedPost && <ExplorePostPlayer post={selectedPost} onClose={() => setSelectedPost(null)} />}
      </AnimatePresence>
    </div>
  );
};

export default SearchPage;
