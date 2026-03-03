import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play, Pause, ChevronUp, ChevronDown } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import CategoryBadge from "./CategoryBadge";
import { mockReals, type VoicePost } from "@/lib/mockData";

const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString());

const RealItem = ({ post }: { post: VoicePost }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);

  const toggleLike = () => {
    setLiked(!liked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative px-6">
      {/* Pulsating ring */}
      <div className="relative mb-8">
        <motion.div
          className="w-40 h-40 rounded-full gradient-coral flex items-center justify-center cursor-pointer relative z-10"
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          <div className="w-36 h-36 rounded-full bg-background flex items-center justify-center">
            <div className="w-32 h-32 rounded-full gradient-coral opacity-20 absolute" />
            {isPlaying ? (
              <WaveformVisualizer bars={post.waveform.slice(0, 16)} isPlaying={true} size="lg" color="coral" />
            ) : (
              <Play size={48} className="text-primary ml-1" />
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
      <div className="text-center mb-6">
        <CategoryBadge category={post.category} />
        <h3 className="text-xl font-bold font-display text-foreground mt-3 mb-2">{post.title}</h3>
        <div className="flex items-center justify-center gap-2">
          <div className="w-7 h-7 rounded-full gradient-coral flex items-center justify-center text-xs font-bold text-primary-foreground">
            {post.author.avatar}
          </div>
          <span className="text-sm text-muted-foreground">{post.author.name}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-8">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }}>
            <Heart size={26} className={liked ? "fill-primary text-primary" : "text-muted-foreground"} />
          </motion.div>
          <span className={`text-xs ${liked ? "text-primary" : "text-muted-foreground"}`}>{formatCount(likeCount)}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <MessageCircle size={26} />
          <span className="text-xs">{formatCount(post.comments)}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <Share2 size={26} />
          <span className="text-xs">{formatCount(post.shares)}</span>
        </button>
      </div>
    </div>
  );
};

const RealsViewer = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const goNext = () => setCurrentIndex((i) => Math.min(i + 1, mockReals.length - 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  return (
    <div ref={containerRef} className="h-[calc(100vh-8rem)] relative overflow-hidden rounded-2xl bg-card">
      {/* Navigation hints */}
      {currentIndex > 0 && (
        <button onClick={goPrev} className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronUp size={24} />
        </button>
      )}
      {currentIndex < mockReals.length - 1 && (
        <button onClick={goNext} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-muted-foreground hover:text-foreground transition-colors">
          <ChevronDown size={24} />
        </button>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <RealItem post={mockReals[currentIndex]} />
        </motion.div>
      </AnimatePresence>

      {/* Progress dots */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
        {mockReals.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentIndex(i)}
            className={`w-1.5 rounded-full transition-all ${i === currentIndex ? "h-6 bg-primary" : "h-1.5 bg-muted-foreground/40"}`}
          />
        ))}
      </div>
    </div>
  );
};

export default RealsViewer;
