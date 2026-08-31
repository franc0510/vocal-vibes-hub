import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause, Trash2, Flag, MapPin, Crown, X, Ban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import CommentsPanel from "./CommentsPanel";
import SharePanel from "./SharePanel";
import LikesListModal from "./LikesListModal";
import { useVoicePosts, type VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { newestFirst } from "@/lib/feedOrder";
import { useAuth } from "@/contexts/AuthContext";
import { useWeeklyVocme } from "@/hooks/useWeeklyVocme";
import { playExclusive, releaseAudio } from "@/lib/audioManager";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import defaultAvatarBg from "@/assets/default-avatar-bg.png";
import StorySlideshow from "./StorySlideshow";
import LiveCaption from "./LiveCaption";
import { useIllustrations } from "@/hooks/useIllustrations";

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

/**
 * Labels that sit directly on the illustration.
 *
 * They used to be muted grey, which reads against the app's own background but
 * disappears over a bright panel — and the panel is what fills this screen.
 * White carries across dark and light pictures alike, and the shadow is what
 * keeps it legible over a pale one, where white alone would vanish just as
 * surely as the grey did.
 */
const OVER_IMAGE = "text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.75)]";
/** Same shadow, for the labels whose colour carries a meaning worth keeping. */
const OVER_IMAGE_SHADOW = "[text-shadow:0_1px_3px_rgb(0_0_0/0.75)]";

// Pre-warm an audio element (load without playing)
const preloadAudio = (url: string): HTMLAudioElement => {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.src = url;
  audio.load();
  return audio;
};

const RealItem = ({ post, onCommentsOpen, onShareOpen, onDelete, onReport, onEnded, onListened, commentCount, onProfileClick, externalPause, isActive = true, onLikeCountPress, onNext, onPrev, preloadedAudio, isWinner }: { post: VoicePostWithAuthor; onCommentsOpen: () => void; onShareOpen: () => void; onDelete: () => void; onReport: () => void; onEnded: () => void; onListened: () => void; commentCount: number; onProfileClick: () => void; externalPause?: boolean; isActive?: boolean; onLikeCountPress?: () => void; onNext?: () => void; onPrev?: () => void; preloadedAudio?: HTMLAudioElement | null; isWinner?: boolean }) => {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [progress, setProgress] = useState(0);
  const [hasListened, setHasListened] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef(false);

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

  // When this item becomes active (Instagram snap), kick off playback.
  // When it becomes inactive, pause immediately.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isActive && !externalPause) {
      // Resume / start playback when scrolled to.
      audio.playbackRate = speed;
      playExclusive(audio)
        .then(() => {
          setIsPlaying(true);
          animRef.current = requestAnimationFrame(updateProgress);
        })
        .catch(() => { /* autoplay sometimes blocked */ });
    } else {
      audio.pause();
      releaseAudio(audio);
      cancelAnimationFrame(animRef.current);
      setIsPlaying(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const avatarUrl = post.author.avatarUrl;
  const backgroundUrl = post.image_url || avatarUrl;

  // Generated panels replace the still background when the anecdote has them.
  const { panels } = useIllustrations(post.id, post.illustration_status);
  // The assembled MP4 when it exists, the panels themselves while it is still
  // being made — the story is watchable either way.
  const hasSlideshow = panels.length > 0 || Boolean(post.video_url);
  // Timestamps are what make live captions possible. Text without them — what
  // the old manual field produced — still gets the printed block below.
  const hasCaptions = Boolean(post.transcription_segments?.length);
  const currentMs = progress * (post.duration_ms ?? (post.duration || 0) * 1000);

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
    
    // Only auto-play if this item is the currently visible one
    if (isActive && !externalPause) {
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
    }

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
      {hasSlideshow ? (
        <StorySlideshow
          panels={panels}
          currentMs={currentMs}
          videoUrl={post.video_url}
          isPlaying={isPlaying}
          isActive={isActive}
          segments={post.transcription_segments}
          className="z-0"
          overlay={
            // The scrim keeps the dark text legible; it must not erase the
            // panel underneath. The theme is light (--background is 98%
            // lightness and nothing ever sets the `dark` class), so these
            // stops paint WHITE — at the old 40/60/90 the illustration was
            // covered by a near-opaque white wash. Weight it to the bottom,
            // where the title and transcription actually sit.
            <div className={`absolute inset-0 ${isWinner ? "bg-gradient-to-b from-amber-500/20 via-background/25 to-background/90" : "bg-gradient-to-b from-background/5 via-background/25 to-background/90"}`} />
          }
        />
      ) : backgroundUrl ? (
        <div className="absolute inset-0 z-0">
          <img src={backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className={`absolute inset-0 ${isWinner ? "bg-gradient-to-b from-amber-500/20 via-background/35 to-background/90" : "bg-gradient-to-b from-background/15 via-background/35 to-background/90"}`} />
        </div>
      ) : (
        <div className="absolute inset-0 z-0">
          <img src={defaultAvatarBg} alt="" className="absolute inset-0 w-full h-full object-cover object-[center_40%]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background/85" />
        </div>
      )}

      {/*
        Captions for anecdotes without a slideshow. They never depended on
        having pictures — only on having timestamps — and reading the sentence
        as it is spoken beats a block of text nobody follows.
      */}
      {!hasSlideshow && <LiveCaption segments={post.transcription_segments} currentMs={currentMs} />}

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

      {/*
        A thin strip along the bottom edge, and nothing else: the story gets the
        whole screen. The padding is computed rather than guessed — the tab bar
        is about 56px plus the home indicator's safe area, and the record button
        juts 32px above it, so a flat pb-20 sat underneath all three.
      */}
      <div
        className="relative z-10 flex-1 flex flex-col justify-end px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 78px)" }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <button onClick={onProfileClick} className="flex items-center gap-2 min-w-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className={`w-7 h-7 shrink-0 rounded-full object-cover border ${isWinner ? "border-amber-400" : "border-primary/40"}`} />
            ) : (
              <div className={`w-7 h-7 shrink-0 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground border ${isWinner ? "border-amber-400" : "border-primary/40"}`}>
                {post.author.avatar}
              </div>
            )}
            <span className="text-xs font-semibold text-foreground truncate drop-shadow">{post.author.name}</span>
          </button>

          <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(post.created_at)}</span>
          {isWinner && <Crown size={12} className="text-amber-400 fill-amber-400 shrink-0" />}
          {post.location && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate">
              <MapPin size={10} className="text-primary shrink-0" />
              {post.location}
            </span>
          )}
        </div>

        {/* One line: a title that wraps would push the picture off the screen. */}
        <h3 className="text-sm font-bold font-display text-foreground truncate mb-2 drop-shadow">
          {post.title}
        </h3>

        {/*
          Transcription. An illustrated anecdote already carries live captions,
          drawn over the story in step with the voice — printing the whole text
          on top of that buries the pictures under a wall of grey.

          Without a slideshow the text is all there is, so it stays; but clamped
          to three lines and expandable, rather than however long the person spoke.
        */}
        <AnimatePresence>
          {post.transcription && !hasSlideshow && !hasCaptions && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={(e) => { e.stopPropagation(); setTranscriptOpen((v) => !v); }}
              className="w-full bg-card/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-border/30 text-left mb-2"
            >
              <p className={`text-[11px] text-foreground/80 leading-snug ${transcriptOpen ? "" : "line-clamp-3"}`}>
                {post.transcription}
              </p>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Transport: one short row, no panel behind it. */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            aria-label={isPlaying ? "Pause" : "Lecture"}
            className="w-8 h-8 shrink-0 rounded-full gradient-red flex items-center justify-center shadow-red"
          >
            {isPlaying ? <Pause size={14} className="text-primary-foreground" /> : <Play size={14} className="text-primary-foreground ml-0.5" />}
          </button>

          {/* The bar is 3px tall; py-2.5 keeps the target thumb-sized anyway. */}
          <div
            ref={seekBarRef}
            onPointerDown={handleSeekDown}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekUp}
            className="relative flex-1 py-2.5 cursor-pointer touch-none"
          >
            <div className="w-full h-[3px] bg-foreground/25 rounded-full overflow-hidden">
              <div className="h-full gradient-red rounded-full" style={{ width: `${progress * 100}%` }} />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border border-background shadow pointer-events-none"
              style={{ left: `calc(${progress * 100}% - 5px)` }}
            />
          </div>

          <span className="text-[10px] text-muted-foreground font-medium tabular-nums shrink-0 drop-shadow">
            {formatDuration(Math.round(progress * post.duration))} / {formatDuration(post.duration)}
          </span>

          <button
            onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
            className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border transition-colors ${speed > 1 ? "bg-primary/20 border-primary/50 text-primary" : "bg-card/60 backdrop-blur-sm border-border/30 text-muted-foreground"}`}
          >
            {speed}x
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="absolute right-4 bottom-1/3 z-10 flex flex-col items-center gap-5">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }} className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <Heart size={22} className={liked ? "fill-primary text-primary" : "text-foreground"} />
          </motion.div>
          <span
            onClick={(e) => { e.stopPropagation(); onLikeCountPress?.(); }}
            className={`text-[10px] font-semibold underline ${liked ? `text-primary ${OVER_IMAGE_SHADOW}` : OVER_IMAGE}`}
          >
            {formatCount(likeCount)}
          </span>
        </button>

        <button onClick={onCommentsOpen} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <MessageCircle size={22} className="text-foreground" />
          </div>
          <span className={`text-[10px] font-semibold ${OVER_IMAGE}`}>{formatCount(commentCount)}</span>
        </button>

        <button onClick={onShareOpen} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <Share2 size={22} className="text-foreground" />
          </div>
          <span className={`text-[10px] font-semibold ${OVER_IMAGE}`}>Share</span>
        </button>

        {user && user.id === post.user_id && (
          <button onClick={onDelete} className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full bg-destructive/20 backdrop-blur-sm border border-destructive/30 flex items-center justify-center">
              <Trash2 size={20} className="text-destructive" />
            </div>
            <span className={`text-[10px] text-destructive font-semibold ${OVER_IMAGE_SHADOW}`}>Delete</span>
          </button>
        )}

        {user && user.id !== post.user_id && (
          <button onClick={onReport} className="flex flex-col items-center gap-1">
            <div className="w-11 h-11 rounded-full bg-red-500/20 backdrop-blur-sm border border-red-500/30 flex items-center justify-center">
              <Flag size={20} className="text-red-500" />
            </div>
            <span className={`text-[10px] text-red-500 font-semibold ${OVER_IMAGE_SHADOW}`}>Report</span>
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
  /** Open straight onto this anecdote instead of the top of the feed. */
  startPostId?: string;
  /** Restrict the feed to one author — used when browsing from a profile. */
  filterUserId?: string;
}

const RealsViewer = ({ filterFriends = false, friendIds = [], filterGroupId, filterAllGroups = false, startPostId, filterUserId }: RealsViewerProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { posts: allPosts, loading, refetch, loadMore, revealPost, revealAll, refreshError } = useVoicePosts();
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
  // Scroll container ref + per-item refs for the snap behaviour
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const posts = filterUserId
    // Chronological, newest first — the order the profile grid displays. The
    // feed's ordering (illustrated first, then engagement bands, shuffled)
    // makes sense for discovery, but it left the reader on a different
    // anecdote from the tile they had just touched.
    ? newestFirst(allPosts.filter((p) => p.user_id === filterUserId && !p.group_id))
    : filterGroupId
    ? allPosts.filter((p) => (p as any).group_id === filterGroupId)
    : filterAllGroups
    ? allPosts.filter((p) => !!(p as any).group_id)
    : filterFriends
    ? allPosts.filter((p) => friendIds.includes(p.user_id))
    : allPosts.filter((p) => !(p as any).group_id); // "For you" hides group-only posts

  // Opening on a chosen anecdote — a tile tapped in Explore — happens in two
  // beats, because the feed reveals five posts at a time and the target may
  // sit deeper: first ask the hook to include it, then, once it is rendered,
  // jump to it. `auto` rather than `smooth`: this is where the screen starts,
  // not a movement the reader should watch.
  // A profile is a finite set — load it whole rather than five at a time.
  useEffect(() => {
    if (filterUserId) revealAll();
  }, [filterUserId, allPosts.length, revealAll]);

  const jumpedRef = useRef(false);
  const [startMissing, setStartMissing] = useState(false);
  useEffect(() => {
    if (!startPostId || jumpedRef.current) return;

    if (!posts.some((p) => p.id === startPostId)) {
      // Only "absent" ends the attempt. The visible posts are seeded from the
      // cache, so they are non-empty long before the fetch lands, and treating
      // that moment as "not in this feed" is what dropped the reader back at
      // the top of the feed instead of on the anecdote they tapped.
      if (revealPost(startPostId) === "absent") {
        // Genuinely not in this feed — a blocked author, or a group anecdote.
        // Landing at the top without a word looks like the tap misfired.
        jumpedRef.current = true;
        setStartMissing(true);
      }
      return;
    }

    const el = itemRefs.current.get(startPostId);
    if (!el) return;
    el.scrollIntoView({ behavior: "auto", block: "start" });
    setCurrentIndex(posts.findIndex((p) => p.id === startPostId));
    jumpedRef.current = true;
  }, [startPostId, allPosts, posts, revealPost]);

  // Preload next (and prev) posts whenever currentIndex changes
  useEffect(() => {
    if (posts.length === 0) return;

    // When we're within 2 items of the end, load more posts in background
    if (currentIndex >= posts.length - 3) {
      loadMore();
    }

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

  // Detect which item is centered/visible using IntersectionObserver
  // for that Instagram-style snap-to-next behaviour.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || posts.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with the largest intersection ratio that is at
        // least 60 % visible — that's the "current" one.
        let bestEntry: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.6) continue;
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry;
          }
        }
        if (!bestEntry) return;
        const id = (bestEntry.target as HTMLElement).dataset.postId;
        if (!id) return;
        const newIndex = posts.findIndex((p) => p.id === id);
        if (newIndex >= 0) {
          setCurrentIndex((prev) => (prev === newIndex ? prev : newIndex));
        }
      },
      {
        root: container,
        threshold: [0.6, 0.75, 0.9],
      }
    );

    for (const el of itemRefs.current.values()) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [posts]);

  const goNext = useCallback(() => {
    if (posts.length === 0) return;
    const next = (currentIndex + 1) % posts.length;
    const nextPost = posts[next];
    const el = nextPost ? itemRefs.current.get(nextPost.id) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setCurrentIndex(next);
  }, [posts, currentIndex]);

  const goPrev = useCallback(async () => {
    if (posts.length === 0) return;
    if (currentIndex === 0) {
      setIsRefreshing(true);
      await refetch();
      setIsRefreshing(false);
      const newIdx = Math.floor(Math.random() * Math.max(posts.length, 1));
      const newPost = posts[newIdx];
      const el = newPost ? itemRefs.current.get(newPost.id) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentIndex(newIdx);
      toast.success("Feed refreshed!");
    } else {
      const prev = currentIndex - 1;
      const prevPost = posts[prev];
      const el = prevPost ? itemRefs.current.get(prevPost.id) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentIndex(prev);
    }
  }, [posts, currentIndex, refetch]);

  const shuffleFeed = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
    if (posts.length > 0) {
      const idx = Math.floor(Math.random() * posts.length);
      const p = posts[idx];
      const el = p ? itemRefs.current.get(p.id) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrentIndex(idx);
    }
    toast.success("Feed refreshed!");
  }, [posts, refetch]);

  // Reset index when posts change
  useEffect(() => {
    if (currentIndex >= posts.length && posts.length > 0) {
      setCurrentIndex(0);
    }
  }, [posts.length, currentIndex]);

  // Double-tap detection (kept for shuffle)
  const lastTapRef = useRef(0);
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
    >
      {/* Pull to refresh indicator */}
      {isRefreshing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {startMissing && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-[88%]">
          <div className="px-3 py-2 rounded-xl bg-card/95 backdrop-blur border border-border/50 shadow-card text-xs text-muted-foreground text-center">
            Cette anecdote n'est pas dans ton feed — son auteur est bloqué.
          </div>
        </div>
      )}

      {/* A refresh can fail while cached posts stay on screen. Saying so beats
          letting the reader wonder why the feed looks stuck in the past. */}
      {refreshError && posts.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-[90%]">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/90 backdrop-blur border border-border/50 shadow-card text-xs text-muted-foreground"
          >
            <span>Feed peut-être daté — appuie pour réessayer</span>
          </button>
        </div>
      )}

      {/* Instagram-style scroll-snap container */}
      <div
        ref={scrollContainerRef}
        className="snap-container no-scrollbar h-full w-full overflow-y-scroll"
        onClick={handleDoubleTap}
      >
        {posts.map((p, idx) => (
          <div
            key={p.id}
            data-post-id={p.id}
            ref={(el) => {
              if (el) itemRefs.current.set(p.id, el);
              else itemRefs.current.delete(p.id);
            }}
            className="snap-item h-full w-full"
          >
            {/* Only mount the active/adjacent items to keep memory under control */}
            {Math.abs(idx - currentIndex) <= 1 ? (
              <RealItem
                post={p}
                commentCount={localCommentCounts[p.id] ?? p.comments_count ?? 0}
                onCommentsOpen={() => setCommentsOpen(true)}
                onShareOpen={() => setShareOpen(true)}
                onDelete={handleDelete}
                onReport={() => setReportOpen(true)}
                onEnded={goNext}
                onListened={() => handleListened(p.id)}
                externalPause={commentsOpen || shareOpen || likesOpen || idx !== currentIndex}
                isActive={idx === currentIndex}
                onLikeCountPress={() => setLikesOpen(true)}
                onNext={goNext}
                onPrev={goPrev}
                preloadedAudio={audioCache.current.get(p.id) ?? null}
                isWinner={!!winnerPostId && p.id === winnerPostId}
                onProfileClick={() => {
                  if (p.user_id) {
                    if (user && p.user_id === user.id) {
                      navigate("/profile");
                    } else {
                      navigate(`/user/${p.user_id}`);
                    }
                  }
                }}
              />
            ) : (
              // Placeholder keeps the scroll-snap pages stable
              <div className="h-full w-full bg-background" />
            )}
          </div>
        ))}
      </div>

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

      {/* Report & Block Modal */}
      <AnimatePresence>
        {reportOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md" 
              onClick={() => setReportOpen(false)} 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <div className="bg-card rounded-2xl w-full max-w-sm overflow-hidden border border-border/50 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-secondary/30">
                  <h3 className="text-base font-bold text-foreground">Report or Block</h3>
                  <button 
                    onClick={() => setReportOpen(false)} 
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Report Section */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Flag size={16} className="text-red-500" />
                    <span className="text-sm font-semibold text-foreground">Report this content</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {["Harassment", "Hate speech", "Explicit", "Copyright", "Spam", "Other"].map((reason) => (
                      <button
                        key={reason}
                        onClick={() => { handleReport(reason); setReportOpen(false); }}
                        className="px-3 py-2.5 rounded-xl text-xs font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-all border border-red-500/20 hover:border-red-500/40"
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Block Button */}
                  <button
                    onClick={async () => {
                      const post = posts[currentIndex];
                      if (!post || !user) return;
                      try {
                        const { error } = await (supabase as any)
                          .from("blocks")
                          .insert({ user_id: user.id, blocked_user_id: post.user_id });
                        if (error && error.code !== "23505") throw error;
                        toast.success("User blocked! Their content is now hidden.");
                        setReportOpen(false);
                        refetch();
                      } catch (err: any) {
                        toast.error(err.message || "Failed to block user");
                      }
                    }}
                    className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Ban size={16} />
                    Block this user
                  </button>

                  {/* Cancel */}
                  <button
                    onClick={() => setReportOpen(false)}
                    className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RealsViewer;
