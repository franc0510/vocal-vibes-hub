import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import { type VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface VoiceCardProps {
  post: VoicePostWithAuthor;
  index: number;
}

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatCount = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
};

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const generateWaveform = (length: number): number[] =>
  Array.from({ length }, () => 0.15 + Math.random() * 0.85);

const VoiceCard = ({ post, index }: VoiceCardProps) => {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveform = useRef(generateWaveform(32)).current;

  const togglePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audio_url);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        toast.error("Appuie à nouveau pour lancer le son");
      });
    }
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow duration-200 border border-border/50"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-sm font-bold text-primary-foreground font-display">
            {post.author.avatar}
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">{post.author.name}</p>
            <p className="text-xs text-muted-foreground">{post.author.username} · {formatTime(post.created_at)}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
          {formatDuration(post.duration)}
        </span>
      </div>

      <p className="text-foreground font-medium mb-3">{post.title}</p>

      <div className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
        <button
          onClick={togglePlay}
          className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-primary-foreground shrink-0 shadow-red transition-transform hover:scale-105 active:scale-95"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="flex-1 overflow-hidden">
          <WaveformVisualizer bars={waveform} isPlaying={isPlaying} size="sm" />
        </div>
      </div>

      <div className="flex items-center gap-6 mt-3 pt-3 border-t border-border/50">
        <button onClick={toggleLike} className="flex items-center gap-1.5 text-sm group">
          <motion.div whileTap={{ scale: 1.3 }}>
            <Heart
              size={18}
              className={liked ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-primary transition-colors"}
            />
          </motion.div>
          <span className={liked ? "text-primary" : "text-muted-foreground"}>{formatCount(likeCount)}</span>
        </button>
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle size={18} />
          <span>{formatCount(post.comments_count)}</span>
        </button>
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Share2 size={18} />
          <span>{formatCount(post.shares_count)}</span>
        </button>
      </div>
    </motion.div>
  );
};

export default VoiceCard;
