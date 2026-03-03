import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import CommentsPanel from "./CommentsPanel";
import { useVoicePosts, type VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const generateWaveform = (length: number): number[] =>
  Array.from({ length }, () => 0.15 + Math.random() * 0.85);

const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString());

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

const RealItem = ({ post, onCommentsOpen }: { post: VoicePostWithAuthor; onCommentsOpen: () => void }) => {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const waveform = useRef(generateWaveform(32)).current;

  // Get avatar URL from the hook data - we need to fetch it
  const avatarUrl = post.author.avatarUrl;

  const updateProgress = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
      if (!audioRef.current.paused) animRef.current = requestAnimationFrame(updateProgress);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audio_url);
      audioRef.current.onended = () => { setIsPlaying(false); setProgress(0); };
    }
    if (isPlaying) {
      audioRef.current.pause();
      cancelAnimationFrame(animRef.current);
    } else {
      audioRef.current.play();
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

  const handleShare = async () => {
    const url = `${window.location.origin}/?post=${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text: `Listen to "${post.title}" by ${post.author.name} on VocMe`, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden flex flex-col">
      {/* Background — avatar blurred */}
      {avatarUrl && (
        <div className="absolute inset-0 z-0">
          <img src={avatarUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110" />
          <div className="absolute inset-0 bg-background/80 backdrop-blur-3xl" />
        </div>
      )}
      {!avatarUrl && (
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 gradient-red opacity-10" />
          <div className="absolute inset-0 bg-background/70" />
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-20">
        {/* Author info top */}
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

        {/* Title */}
        <h3 className="text-xl font-bold font-display text-foreground text-center mb-8 max-w-[280px] leading-snug">
          {post.title}
        </h3>

        {/* Waveform player — the star */}
        <motion.div
          className="w-full max-w-[300px] bg-card/60 backdrop-blur-md rounded-2xl p-5 border border-border/30 shadow-elevated cursor-pointer mb-4"
          whileTap={{ scale: 0.98 }}
          onClick={togglePlay}
        >
          {/* Progress bar */}
          <div className="w-full h-1 bg-secondary rounded-full mb-4 overflow-hidden">
            <motion.div className="h-full gradient-red rounded-full" style={{ width: `${progress * 100}%` }} />
          </div>

          {/* Waveform */}
          <div className="h-16 flex items-center justify-center">
            <WaveformVisualizer bars={waveform} isPlaying={isPlaying} size="lg" color="coral" />
          </div>

          {/* Play button + duration */}
          <div className="flex items-center justify-between mt-4">
            <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center shadow-red">
              {isPlaying ? <Pause size={18} className="text-primary-foreground" /> : <Play size={18} className="text-primary-foreground ml-0.5" />}
            </div>
            <span className="text-xs text-muted-foreground font-medium">{formatDuration(post.duration)}</span>
          </div>
        </motion.div>
      </div>

      {/* Actions — right side TikTok style */}
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
          <span className="text-[10px] text-muted-foreground font-medium">{formatCount(post.comments_count)}</span>
        </button>

        <button onClick={handleShare} className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-card/60 backdrop-blur-sm border border-border/30 flex items-center justify-center">
            <Share2 size={22} className="text-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">Share</span>
        </button>
      </div>
    </div>
  );
};

const RealsViewer = () => {
  const { posts, loading } = useVoicePosts();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, posts.length - 1));
  }, [posts.length]);

  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) goNext();
    else if (diff < -50) goPrev();
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
        <p className="text-lg font-display font-bold text-foreground mb-1">No stories yet</p>
        <p className="text-sm text-muted-foreground">Be the first to share a voice story!</p>
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
          key={currentIndex}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <RealItem post={currentPost} onCommentsOpen={() => setCommentsOpen(true)} />
        </motion.div>
      </AnimatePresence>

      <CommentsPanel open={commentsOpen} onClose={() => setCommentsOpen(false)} postId={currentPost?.id || ""} />
    </div>
  );
};

export default RealsViewer;
