import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause, Trash2, Flag, Gauge, MapPin, Crown, SkipBack, SkipForward } from "lucide-react";
import { useNavigate } from "react-router-dom";
import WaveformVisualizer from "./WaveformVisualizer";
import CommentsPanel from "./CommentsPanel";
import SharePanel from "./SharePanel";
import LikesListModal from "./LikesListModal";
import { useVoicePosts, type VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { useAuth } from "@/contexts/AuthContext";
import { useWeeklyVocme } from "@/hooks/useWeeklyVocme";
import { playExclusive, releaseAudio } from "@/lib/audioManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import defaultAvatarBg from "@/assets/default-avatar-bg.png";

const generateWaveform = (length: number): number[] =>
  Array.from({ length }, () => 0.15 + Math.random() * 0.85);

const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString());

// Generate a deterministic gradient based on a string (username/name)
const getAvatarGradient = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash % 360);
  const h2 = (h1 + 40 + Math.abs((hash >> 8) % 60)) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 70%, 45%), hsl(${h2}, 80%, 55%))`;
};

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

// Pre-warm an audio element (load without playing)
const preloadAudio = (url: string): HTMLAudioElement => {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  return audio;
};

const RealItem = ({ post, onCommentsOpen, onShareOpen, onDelete, onReport, onEnded, onListened, commentCount, onProfileClick, externalPause, onLikeCountPress, onNext, onPrev, preloadedAudio, isWinner }: { post: VoicePostWithAuthor; onCommentsOpen: () => void; onShareOpen: () => void; onDelete: () => void; onReport: () => void; onEnded: () => void; onListened: () => void; commentCount: number; onProfileClick: () => void; externalPause?: boolean; onLikeCountPress?: () => void; onNext?: () => void; onPrev?: () => void; preloadedAudio?: HTMLAudioElement | null; isWinner?: boolean }) => {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [progress, setProgress] = useState(0);
  const [hasListened, setHasListened] = useState(false);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef(false);
  const waveform = useRef(generateWaveform(32)).current;

  // --- Seek / scrubbing (video-like navigation) ---
  const seekToClientX = (clientX: number) => {
    const bar = seekBarRef.current;
    const audio = audioRef.current;
    if (!bar || !audio) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const dur = audio.duration || post.duration || 1;
    audio.currentTime = ratio * dur;
    setProgress(ratio);
  };
  const handleSeekDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    isSeekingRef.current = true;
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    seekToClientX(e.clientX);
  };
  const handleSeekMove = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    e.stopPropagation();
    seekToClientX(e.clientX);
  };
  const handleSeekUp = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    e.stopPropagation();
    isSeekingRef.current = false;
  };
  // Jump to start / end quickly
  const jumpToStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) { audioRef.current.currentTime = 0; setProgress(0); }
  };
  const jumpToEnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration || post.duration || 0;
    audio.currentTime = Math.max(0, dur - 0.3);
    setProgress(1);
  };

  // Cycle playback speed: 1x -> 1.5x -> 2x -> 1x
  const cycleSpeed = () => {
    setSpeed((prev) => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  };

  // Pause audio when external pause is triggered (e.g. comments panel opened)
  useEffect(() => {
    if (externalPause && isPlaying && audioRef.current) {
      audioRef.current.pause();
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
    }
  }, [externalPause]);

  const avatarUrl = post.author.avatarUrl;
  const backgroundUrl = post.image_url || avatarUrl;

  // Use preloaded audio (already loaded) or create new one
  useEffect(() => {
    // Clean up previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    cancelAnimationFrame(animRef.current);
    setIsPlaying(false);
    setProgress(0);
    setHasListened(false);

    // Use the preloaded audio element if available, otherwise create fresh
    const audio = preloadedAudio ?? preloadAudio(post.audio_url);
    
    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      onEnded();
    };
    
    audio.onerror = (e) => {
      console.error("❌ Audio error:", e, audio.error);
    };

    audioRef.current = audio;
    
    // Try autoplay immediately (audio is already loaded if preloaded)
    const tryAutoPlay = async () => {
      try {
        audio.playbackRate = speed;
        await playExclusive(audio);
        setIsPlaying(true);
        animRef.current = requestAnimationFrame(updateProgress);
      } catch (err) {
        console.log("⚠️ Autoplay blocked");
      }
    };
    
    tryAutoPlay();

    return () => {
      audio.pause();
      releaseAudio(audio);
      cancelAnimationFrame(animRef.current);
    };
  }, [post.id]);

  // Media Session API for lock screen controls
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: post.title,
      artist: post.author.name,
      album: "VocMe",
      artwork: post.author.avatarUrl
        ? [{ src: post.author.avatarUrl, sizes: "256x256", type: "image/png" }]
        : [],
    });

    navigator.mediaSession.setActionHandler("play", () => {
      if (audioRef.current) playExclusive(audioRef.current);
      setIsPlaying(true);
      animRef.current = requestAnimationFrame(updateProgress);
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      audioRef.current?.pause();
      releaseAudio(audioRef.current);
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
    });
    navigator.mediaSession.setActionHandler("nexttrack", () => { onNext?.(); });
    navigator.mediaSession.setActionHandler("previoustrack", () => { onPrev?.(); });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
    };
  }, [post.id, post.title, onNext, onPrev]);

  const updateProgress = () => {
    if (audioRef.current) {
      const currentTime = audioRef.current.currentTime;
      const duration = audioRef.current.duration || 1;
      setProgress(currentTime / duration);
      
      // Mark as listened after 2 seconds
      if (currentTime >= 2 && !hasListened) {
        setHasListened(true);
        onListened();
      }
      
      if (!audioRef.current.paused) {
        animRef.current = requestAnimationFrame(updateProgress);
      }
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      console.error("❌ No audio element");
      toast.error("Erreur audio");
      return;
    }
    
    if (isPlaying) {
      audio.pause();
      releaseAudio(audio);
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
    } else {
      console.log("▶️ Attempting to play...");
      try {
        await playExclusive(audio);
        console.log("✅ Playing!");
        setIsPlaying(true);
        animRef.current = requestAnimationFrame(updateProgress);
      } catch (err: any) {
        console.error("❌ Play error:", err.name, err.message);
        toast.error("Impossible de lire l'audio");
      }
    }
  };

  const toggleLike = async () => {
    if (!user) { toast.error("Sign in to like"); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);
    try {
      if (newLiked) await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: post.id });
      else await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", post.id);
      // Refresh actual count from DB
      const { count } = await supabase
        .from("voice_post_likes")
        .select("id", { count: "exact", head: true })
        .eq("post_id", post.id);
      if (count !== null) setLikeCount(count);
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => newLiked ? c - 1 : c + 1);
      toast.error("Failed to update like");
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col">
      {backgroundUrl ? (
        <div className="absolute inset-0 z-0">
          <img src={backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className={`absolute inset-0 ${isWinner ? "bg-gradient-to-b from-amber-500/20 via-background/60 to-background/90" : "bg-gradient-to-b from-background/40 via-background/60 to-background/90"}`} />
        </div>
      ) : (
        <div className="absolute inset-0 z-0">
          <img src={defaultAvatarBg} alt="" className="absolute inset-0 w-full h-full object-cover object-[center_40%]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background/85" />
        </div>
      )}

      {/* VocMe of the week — golden glow border */}
      {isWinner && (
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 ring-4 ring-amber-400/60 ring-inset rounded-none animate-pulse" />
          <motion.div
            className="absolute inset-0"
            style={{ boxShadow: "inset 0 0 80px rgba(251,191,36,0.4)" }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          />
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="flex items-center gap-3 mb-3 cursor-pointer" onClick={onProfileClick}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className={`w-12 h-12 rounded-full object-cover border-2 ${isWinner ? "border-amber-400" : "border-primary/30"}`} />
          ) : (
            <div className={`w-12 h-12 rounded-full gradient-red flex items-center justify-center text-sm font-bold text-primary-foreground border-2 ${isWinner ? "border-amber-400" : "border-primary/30"}`}>
              {post.author.avatar}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
              {post.author.name}
              {isWinner && <Crown size={14} className="text-amber-400 fill-amber-400" />}
            </p>
            <p className="text-xs text-muted-foreground">{post.author.username} · {formatTime(post.created_at)}</p>
          </div>
        </div>

        {/* VocMe of the week badge */}
        {isWinner && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/50 mb-3"
          >
            <Crown size={13} className="text-amber-400 fill-amber-400" />
            <span className="text-[11px] font-bold text-amber-300">VocMe of the Week</span>
          </motion.div>
        )}

        {/* Location badge */}
        {post.location && (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-card/50 backdrop-blur-sm border border-border/20 mb-3">
            <MapPin size={11} className="text-primary" />
            <span className="text-[11px] text-foreground/80 font-medium">{post.location}</span>
          </div>
        )}

        <h3 className="text-xl font-bold font-display text-foreground text-center mb-6 max-w-[280px] leading-snug">
          {post.title}
        </h3>

        <motion.div
          className="w-full max-w-[300px] bg-card/60 backdrop-blur-md rounded-2xl p-5 border border-border/30 shadow-elevated mb-4"
          whileTap={{ scale: 0.99 }}
        >
          {/* Interactive seek bar (drag to scrub like a video) */}
          <div
            ref={seekBarRef}
            onPointerDown={handleSeekDown}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekUp}
            className="relative w-full py-2 cursor-pointer touch-none"
          >
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full gradient-red rounded-full" style={{ width: `${progress * 100}%` }} />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background shadow-md pointer-events-none"
              style={{ left: `calc(${progress * 100}% - 7px)` }}
            />
          </div>
          {/* Time labels */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">{formatDuration(Math.round(progress * post.duration))}</span>
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">{formatDuration(post.duration)}</span>
          </div>
          <div className="h-14 flex items-center justify-center cursor-pointer" onClick={togglePlay}>
            <WaveformVisualizer bars={waveform} isPlaying={isPlaying} size="lg" color="coral" />
          </div>
          <div className="flex items-center justify-between mt-4">
            {/* Jump to start */}
            <button onClick={jumpToStart} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <SkipBack size={15} />
            </button>
            {/* Play / Pause */}
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} className="w-12 h-12 rounded-full gradient-red flex items-center justify-center shadow-red">
              {isPlaying ? <Pause size={20} className="text-primary-foreground" /> : <Play size={20} className="text-primary-foreground ml-0.5" />}
            </button>
            {/* Jump to end */}
            <button onClick={jumpToEnd} className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <SkipForward size={15} />
            </button>
            {/* Speed control */}
            <button
              onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${speed > 1 ? "bg-primary/20 border-primary/50 text-primary" : "bg-secondary border-border/30 text-muted-foreground"}`}
            >
              <Gauge size={13} />
              <span className="text-xs font-bold">{speed}x</span>
            </button>
          </div>
        </motion.div>

        {/* Transcription / text */}
        {post.transcription && (
          <div className="w-full max-w-[300px] bg-card/40 backdrop-blur-sm rounded-xl px-4 py-3 border border-border/20">
            <p className="text-xs text-foreground/80 leading-relaxed italic">"{post.transcription}"</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="absolute right-4 bottom-1/3 z-10 flex flex-col items-center gap-5">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }} className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <Heart size={22} className={liked ? "fill-primary text-primary" : "text-foreground"} />
          </motion.div>
          <span
            onClick={(e) => { e.stopPropagation(); onLikeCountPress?.(); }}
            className={`text-[10px] font-medium ${liked ? "text-primary" : "text-muted-foreground"} underline`}
          >
            {formatCount(likeCount)}
          </span>
        </button>

        <button onClick={onCommentsOpen} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <MessageCircle size={22} className="text-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">{formatCount(commentCount)}</span>
        </button>

        <button onClick={onShareOpen} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <Share2 size={22} className="text-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">Share</span>
        </button>

        {user && user.id === post.user_id && (
          <button onClick={onDelete} className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full bg-destructive/20 backdrop-blur-sm border border-destructive/30 flex items-center justify-center">
              <Trash2 size={20} className="text-destructive" />
            </div>
            <span className="text-[10px] text-destructive font-medium">Delete</span>
          </button>
        )}

        {user && user.id !== post.user_id && (
          <button onClick={onReport} className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
              <Flag size={20} className="text-muted-foreground" />
            </div>
            <span className="text-[10px] text-muted-foreground font-medium">Report</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface RealsViewerProps {
  filterFriends?: boolean;
  friendIds?: string[];
  filterGroupId?: string;
  filterAllGroups?: boolean;
}

const RealsViewer = ({ filterFriends = false, friendIds = [], filterGroupId, filterAllGroups = false }: RealsViewerProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { posts: allPosts, loading, refetch } = useVoicePosts();
  const { winnerPostId } = useWeeklyVocme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const [localCommentCounts, setLocalCommentCounts] = useState<Record<string, number>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Cache of preloaded audio elements keyed by post id
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());

  const posts = filterGroupId
    ? allPosts.filter((p) => (p as any).group_id === filterGroupId)
    : filterAllGroups
    ? allPosts.filter((p) => !!(p as any).group_id)
    : filterFriends
    ? allPosts.filter((p) => friendIds.includes(p.user_id))
    : allPosts.filter((p) => !(p as any).group_id); // "For you" hides group-only posts

  // Preload next (and prev) posts whenever currentIndex changes
  useEffect(() => {
    if (posts.length === 0) return;

    const toPreload = [
      posts[(currentIndex + 1) % posts.length],
      posts[(currentIndex + 2) % posts.length],
    ].filter(Boolean);

    for (const p of toPreload) {
      if (!audioCache.current.has(p.id)) {
        audioCache.current.set(p.id, preloadAudio(p.audio_url));
      }
    }

    // Evict old entries beyond a window of 6 to avoid memory bloat
    const keepIds = new Set(posts.slice(Math.max(0, currentIndex - 2), currentIndex + 4).map((p) => p.id));
    for (const [id, audio] of audioCache.current.entries()) {
      if (!keepIds.has(id)) {
        audio.pause();
        audio.src = "";
        audioCache.current.delete(id);
      }
    }
  }, [currentIndex, posts]);

  const goNext = useCallback(() => {
    if (posts.length === 0) return;
    setCurrentIndex((i) => (i + 1) % posts.length);
  }, [posts.length]);

  const goPrev = useCallback(async () => {
    if (posts.length === 0) return;
    if (currentIndex === 0) {
      setIsRefreshing(true);
      await refetch();
      setIsRefreshing(false);
      setCurrentIndex(Math.floor(Math.random() * Math.max(posts.length, 1)));
      toast.success("Feed refreshed!");
    } else {
      setCurrentIndex((i) => i - 1);
    }
  }, [posts.length, currentIndex, refetch]);

  const shuffleFeed = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    if (posts.length > 0) {
      setCurrentIndex(Math.floor(Math.random() * posts.length));
    }
    toast.success("Feed refreshed!");
  }, [posts.length, refetch]);

  // Reset index when posts change
  useEffect(() => {
    if (currentIndex >= posts.length && posts.length > 0) {
      setCurrentIndex(0);
    }
  }, [posts.length, currentIndex]);

  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const lastTapRef = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = async (e: React.TouchEvent) => {
    const diffY = touchStartY.current - e.changedTouches[0].clientY;
    const diffX = Math.abs(touchStartX.current - e.changedTouches[0].clientX);
    // Only treat as vertical swipe if Y movement dominates
    if (Math.abs(diffY) > 40 && Math.abs(diffY) > diffX * 1.5) {
      if (diffY > 0) goNext();
      else await goPrev();
    }
  };

  // Double-tap to shuffle
  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      shuffleFeed();
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  const handleDelete = async () => {
    const post = posts[currentIndex];
    if (!post || !user || user.id !== post.user_id) return;
    const confirmed = window.confirm("Delete this voice post?");
    if (!confirmed) return;
    const { error } = await supabase.from("voice_posts").delete().eq("id", post.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Post deleted!");
    if (currentIndex >= posts.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1));
    refetch();
  };

  const handleReport = async (reason: string) => {
    const post = posts[currentIndex];
    if (!post || !user) return;
    const { error } = await supabase.from("reports").insert({ user_id: user.id, post_id: post.id, reason } as any);
    if (error) {
      if (error.code === "23505") toast.info("You already reported this post");
      else toast.error("Failed to report");
      return;
    }
    toast.success("Post reported. Thank you!");
  };

  const handleListened = async (postId: string) => {
    if (!user || !postId) return;
    // Use upsert with onConflict to ignore duplicates gracefully
    await (supabase as any)
      .from("listened_posts")
      .upsert({ user_id: user.id, post_id: postId }, { onConflict: "user_id,post_id", ignoreDuplicates: true });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <p className="text-lg font-display font-bold text-foreground mb-1">
          {filterFriends ? "No friend posts yet" : "No stories yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {filterFriends ? "Follow users to see their posts here!" : "Be the first to share a voice story!"}
        </p>
      </div>
    );
  }

  const currentPost = posts[currentIndex];

  return (
    <div
      className="h-full w-full relative overflow-hidden bg-background"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleDoubleTap}
    >
      {/* Pull to refresh indicator */}
      {isRefreshing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${currentIndex}-${currentPost?.id}`}
          initial={{ y: 50, opacity: 0.3 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="h-full"
        >
          <RealItem
            post={currentPost}
            commentCount={localCommentCounts[currentPost?.id] ?? currentPost?.comments_count ?? 0}
            onCommentsOpen={() => setCommentsOpen(true)}
            onShareOpen={() => setShareOpen(true)}
            onDelete={handleDelete}
            onReport={() => setReportOpen(true)}
            onEnded={goNext}
            onListened={() => handleListened(currentPost?.id)}
            externalPause={commentsOpen || shareOpen || likesOpen}
            onLikeCountPress={() => setLikesOpen(true)}
            onNext={goNext}
            onPrev={goPrev}
            preloadedAudio={audioCache.current.get(currentPost?.id) ?? null}
            isWinner={!!winnerPostId && currentPost?.id === winnerPostId}
            onProfileClick={() => {
              if (currentPost?.user_id) {
                if (user && currentPost.user_id === user.id) {
                  navigate("/profile");
                } else {
                  navigate(`/user/${currentPost.user_id}`);
                }
              }
            }}
          />
        </motion.div>
      </AnimatePresence>

      <CommentsPanel
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={currentPost?.id || ""}
        onCommentAdded={() => {
          if (currentPost) {
            setLocalCommentCounts((prev) => ({
              ...prev,
              [currentPost.id]: (prev[currentPost.id] ?? currentPost.comments_count) + 1,
            }));
          }
        }}
      />
      <SharePanel open={shareOpen} onClose={() => setShareOpen(false)} postId={currentPost?.id || ""} postTitle={currentPost?.title || ""} postAuthor={currentPost?.author.name || ""} />
      <LikesListModal open={likesOpen} onClose={() => setLikesOpen(false)} postId={currentPost?.id || ""} />

      {/* Report Modal */}
      <AnimatePresence>
        {reportOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={() => setReportOpen(false)} />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center px-6"
            >
              <div className="bg-card rounded-2xl p-5 w-full max-w-sm border border-border/50 shadow-elevated">
                <h3 className="text-sm font-bold font-display text-foreground mb-3">Report this post</h3>
                <div className="space-y-2">
                  {["Inappropriate content", "Spam", "Harassment", "Other"].map((reason) => (
                    <button
                      key={reason}
                      onClick={() => { handleReport(reason); setReportOpen(false); }}
                      className="w-full text-left px-4 py-2.5 rounded-xl text-sm text-foreground bg-secondary hover:bg-secondary/80 transition-colors"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
                <button onClick={() => setReportOpen(false)} className="w-full mt-3 text-xs text-muted-foreground text-center py-2">Cancel</button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RealsViewer;
