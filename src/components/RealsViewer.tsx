import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const RealItem = ({ post }: { post: VoicePostWithAuthor }) => {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveform = useRef(generateWaveform(16)).current;

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audio_url);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleLike = async () => {
    if (!user) {
      toast.error("Sign in to like posts");
      return;
    }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);

    if (newLiked) {
      await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: post.id });
    } else {
      await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", post.id);
    }
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative px-6">
      {/* Pulsating ring */}
      <div className="relative mb-6">
        <motion.div
          className="w-36 h-36 rounded-full gradient-red flex items-center justify-center cursor-pointer relative z-10 shadow-red"
          whileTap={{ scale: 0.95 }}
          onClick={togglePlay}
        >
          <div className="w-32 h-32 rounded-full bg-card flex items-center justify-center">
            <div className="w-28 h-28 rounded-full bg-primary/10 absolute" />
            {isPlaying ? (
              <WaveformVisualizer bars={waveform} isPlaying={true} size="lg" color="coral" />
            ) : (
              <Play size={44} className="text-primary ml-1" />
            )}
          </div>
        </motion.div>
        {isPlaying && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary/40"
              animate={{ scale: [1, 1.3], opacity: [0.6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary/20"
              animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
            />
          </>
        )}
      </div>

      {/* Info */}
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold font-display text-foreground mb-2">{post.title}</h3>
        <div className="flex items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
            {post.author.avatar}
          </div>
          <span className="text-sm text-muted-foreground">{post.author.name}</span>
          <span className="text-xs text-muted-foreground">· {formatTime(post.created_at)}</span>
        </div>
      </div>

      {/* Actions – right side like TikTok */}
      <div className="absolute right-4 bottom-1/4 flex flex-col items-center gap-6">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }}>
            <Heart size={26} className={liked ? "fill-primary text-primary" : "text-foreground"} />
          </motion.div>
          <span className={`text-xs ${liked ? "text-primary" : "text-muted-foreground"}`}>{formatCount(likeCount)}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-foreground">
          <MessageCircle size={26} />
          <span className="text-xs text-muted-foreground">{formatCount(post.comments_count)}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-foreground">
          <Share2 size={26} />
          <span className="text-xs text-muted-foreground">{formatCount(post.shares_count)}</span>
        </button>
      </div>
    </div>
  );
};

const RealsViewer = () => {
  const { posts, loading } = useVoicePosts();
  const [currentIndex, setCurrentIndex] = useState(0);

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
          <RealItem post={posts[currentIndex]} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default RealsViewer;
