import { useState } from "react";
import { motion } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import { type VoicePost, REACTION_EMOJIS } from "@/lib/mockData";

interface VoiceCardProps {
  post: VoicePost;
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

const VoiceCard = ({ post, index }: VoiceCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [reactions, setReactions] = useState(post.reactions);
  const [showReactions, setShowReactions] = useState(false);

  const toggleLike = () => {
    setLiked(!liked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  const addReaction = (emoji: string) => {
    setReactions((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] || 0) + 1,
    }));
    setShowReactions(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="bg-card rounded-2xl p-4 shadow-card hover:shadow-elevated transition-shadow duration-200 border border-border/50"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-sm font-bold text-primary-foreground font-display">
            {post.author.avatar}
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">{post.author.name}</p>
            <p className="text-xs text-muted-foreground">{post.author.username} · {post.createdAt}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-full">
          {formatDuration(post.duration)}
        </span>
      </div>

      {/* Title */}
      <p className="text-foreground font-medium mb-3">{post.title}</p>

      {/* Player */}
      <div className="flex items-center gap-3 bg-secondary/60 rounded-xl p-3">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-primary-foreground shrink-0 shadow-red transition-transform hover:scale-105 active:scale-95"
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>
        <div className="flex-1 overflow-hidden">
          <WaveformVisualizer bars={post.waveform} isPlaying={isPlaying} size="sm" />
        </div>
      </div>

      {/* Reactions */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {Object.entries(reactions)
          .filter(([, count]) => count > 0)
          .map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => addReaction(emoji)}
              className="flex items-center gap-1 bg-secondary hover:bg-primary/10 px-2.5 py-1 rounded-full text-xs transition-colors border border-border/50"
            >
              <span>{emoji}</span>
              <span className="text-muted-foreground">{count}</span>
            </button>
          ))}
        <div className="relative">
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="w-7 h-7 rounded-full bg-secondary hover:bg-primary/10 flex items-center justify-center text-muted-foreground text-sm transition-colors border border-border/50"
          >
            +
          </button>
          {showReactions && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute bottom-full left-0 mb-2 flex gap-1 bg-card shadow-elevated rounded-xl p-2 z-10 border border-border"
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => addReaction(emoji)}
                  className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-lg transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* Actions */}
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
          <span>{formatCount(post.comments)}</span>
        </button>
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <Share2 size={18} />
          <span>{formatCount(post.shares)}</span>
        </button>
      </div>
    </motion.div>
  );
};

export default VoiceCard;
