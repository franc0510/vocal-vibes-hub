import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause, Trash2, Flag } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import CommentsPanel from "./CommentsPanel";
import SharePanel from "./SharePanel";
import { useVoicePosts, type VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { useAuth } from "@/contexts/AuthContext";
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

const RealItem = ({ post, onCommentsOpen, onShareOpen, onDelete, onEnded, commentCount }: { post: VoicePostWithAuthor; onCommentsOpen: () => void; onShareOpen: () => void; onDelete: () => void; onEnded: () => void; commentCount: number }) => {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const waveform = useRef(generateWaveform(32)).current;

  const avatarUrl = post.author.avatarUrl;

  // Setup audio on mount — don't auto-play (blocked on mobile)
  useEffect(() => {
    const audio = new Audio(post.audio_url);
    audioRef.current = audio;
    audio.onended = () => {
      setIsPlaying(false);
      setProgress(0);
      onEnded();
    };

    // Try to auto-play (works on desktop, may fail on mobile)
    audio.play().then(() => {
      setIsPlaying(true);
      animRef.current = requestAnimationFrame(updateProgress);
    }).catch(() => {
      // Mobile blocks autoplay — user must tap to play
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
      cancelAnimationFrame(animRef.current);
    };
  }, [post.id]);

  const updateProgress = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
      if (!audioRef.current.paused) animRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      cancelAnimationFrame(animRef.current);
    } else {
      audioRef.current.play().catch(() => {
        toast.error("Appuie pour lancer le son");
      });
      animRef.current = requestAnimationFrame(updateProgress);
    }
    setIsPlaying(!isPlaying);
  };

  const toggleLike = async () => {
    if (!user) { toast.error("Sign in to like"); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);
    if (newLiked) await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: post.id });
    else await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", post.id);
  };

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col">
      {avatarUrl ? (
        <div className="absolute inset-0 z-0">
          <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/90" />
        </div>
      ) : (
        <div className="absolute inset-0 z-0">
          <img src={defaultAvatarBg} alt="" className="absolute inset-0 w-full h-full object-cover object-[center_40%]" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/40 to-background/85" />
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
        <div className="flex items-center gap-3 mb-8">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-primary/30" />
          ) : (
            <div className="w-12 h-12 rounded-full gradient-red flex items-center justify-center text-sm font-bold text-primary-foreground border-2 border-primary/30">
              {post.author.avatar}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-foreground">{post.author.name}</p>
            <p className="text-xs text-muted-foreground">{post.author.username} · {formatTime(post.created_at)}</p>
          </div>
        </div>

        <h3 className="text-xl font-bold font-display text-foreground text-center mb-8 max-w-[280px] leading-snug">
          {post.title}
        </h3>

        <motion.div
          className="w-full max-w-[300px] bg-card/60 backdrop-blur-md rounded-2xl p-5 border border-border/30 shadow-elevated cursor-pointer mb-4"
          whileTap={{ scale: 0.98 }}
          onClick={togglePlay}
        >
          <div className="w-full h-1 bg-secondary rounded-full mb-4 overflow-hidden">
            <motion.div className="h-full gradient-red rounded-full" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="h-16 flex items-center justify-center">
            <WaveformVisualizer bars={waveform} isPlaying={isPlaying} size="lg" color="coral" />
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center shadow-red">
              {isPlaying ? <Pause size={18} className="text-primary-foreground" /> : <Play size={18} className="text-primary-foreground ml-0.5" />}
            </div>
            <span className="text-xs text-muted-foreground font-medium">{formatDuration(post.duration)}</span>
          </div>
        </motion.div>
      </div>

      {/* Actions */}
      <div className="absolute right-4 bottom-1/3 z-10 flex flex-col items-center gap-5">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }} className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <Heart size={22} className={liked ? "fill-primary text-primary" : "text-foreground"} />
          </motion.div>
          <span className={`text-[10px] font-medium ${liked ? "text-primary" : "text-muted-foreground"}`}>{formatCount(likeCount)}</span>
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
            <span className="text-[10px] text-destructive font-medium">Suppr.</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface RealsViewerProps {
  filterFriends?: boolean;
  friendIds?: string[];
}

const RealsViewer = ({ filterFriends = false, friendIds = [] }: RealsViewerProps) => {
  const { user } = useAuth();
  const { posts: allPosts, loading, refetch } = useVoicePosts();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [localCommentCounts, setLocalCommentCounts] = useState<Record<string, number>>({});

  const posts = filterFriends
    ? allPosts.filter((p) => friendIds.includes(p.user_id))
    : allPosts;

  const goNext = useCallback(() => {
    if (posts.length === 0) return;
    setCurrentIndex((i) => (i + 1) % posts.length);
  }, [posts.length]);

  const goPrev = () => {
    if (posts.length === 0) return;
    setCurrentIndex((i) => (i - 1 + posts.length) % posts.length);
  };

  // Reset index when posts change
  useEffect(() => {
    if (currentIndex >= posts.length && posts.length > 0) {
      setCurrentIndex(0);
    }
  }, [posts.length, currentIndex]);

  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) goNext();
    else if (diff < -50) goPrev();
  };

  const handleDelete = async () => {
    const post = posts[currentIndex];
    if (!post || !user || user.id !== post.user_id) return;
    const confirmed = window.confirm("Supprimer ce vocal ? Tu pourras en republier un aujourd'hui.");
    if (!confirmed) return;
    const { error } = await supabase.from("voice_posts").delete().eq("id", post.id);
    if (error) { toast.error("Erreur lors de la suppression"); return; }
    toast.success("Vocal supprimé !");
    if (currentIndex >= posts.length - 1) setCurrentIndex(Math.max(0, currentIndex - 1));
    refetch();
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
          {filterFriends ? "Aucun vocal d'amis" : "No stories yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {filterFriends ? "Suis des utilisateurs pour voir leurs vocaux ici !" : "Be the first to share a voice story!"}
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
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={`${currentIndex}-${currentPost?.id}`}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <RealItem
            post={currentPost}
            commentCount={localCommentCounts[currentPost?.id] ?? currentPost?.comments_count ?? 0}
            onCommentsOpen={() => setCommentsOpen(true)}
            onShareOpen={() => setShareOpen(true)}
            onDelete={handleDelete}
            onEnded={goNext}
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
    </div>
  );
};

export default RealsViewer;
