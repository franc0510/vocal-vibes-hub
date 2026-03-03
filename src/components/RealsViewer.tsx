import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import CategoryBadge from "./CategoryBadge";
import { mockReals, type VoicePost } from "@/lib/mockData";

// Generate infinite reals by cycling through mock data
const generateWaveform = (length: number): number[] =>
  Array.from({ length }, () => 0.15 + Math.random() * 0.85);

const generateReal = (index: number): VoicePost => {
  const base = mockReals[index % mockReals.length];
  return {
    ...base,
    id: `r-${index}`,
    waveform: generateWaveform(32),
    likes: Math.floor(Math.random() * 10000),
    comments: Math.floor(Math.random() * 500),
    shares: Math.floor(Math.random() * 300),
    isLiked: Math.random() > 0.5,
  };
};

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
      {/* Pulsating ring — red/white theme */}
      <div className="relative mb-8">
        <motion.div
          className="w-40 h-40 rounded-full bg-gradient-to-br from-destructive to-destructive/80 flex items-center justify-center cursor-pointer relative z-10"
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          <div className="w-36 h-36 rounded-full bg-background flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-destructive/20 absolute" />
            {isPlaying ? (
              <WaveformVisualizer bars={post.waveform.slice(0, 16)} isPlaying={true} size="lg" color="coral" />
            ) : (
              <Play size={48} className="text-destructive ml-1" />
            )}
          </div>
        </motion.div>
        {isPlaying && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-destructive/50"
              animate={{ scale: [1, 1.3], opacity: [0.6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-destructive/25"
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
          <div className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center text-xs font-bold text-foreground">
            {post.author.avatar}
          </div>
          <span className="text-sm text-muted-foreground">{post.author.name}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-8">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }}>
            <Heart size={26} className={liked ? "fill-destructive text-destructive" : "text-muted-foreground"} />
          </motion.div>
          <span className={`text-xs ${liked ? "text-destructive" : "text-muted-foreground"}`}>{formatCount(likeCount)}</span>
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
  const [reals, setReals] = useState<VoicePost[]>(() =>
    Array.from({ length: 10 }, (_, i) => generateReal(i))
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => {
      const next = i + 1;
      // Load more when near end
      if (next >= reals.length - 3) {
        setReals((prev) => [
          ...prev,
          ...Array.from({ length: 5 }, (_, j) => generateReal(prev.length + j)),
        ]);
      }
      return next;
    });
  }, [reals.length]);

  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  // Touch/swipe handling
  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) goNext();
    else if (diff < -50) goPrev();
  };

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-8rem)] relative overflow-hidden rounded-2xl bg-card border border-destructive/20"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation hints */}
      {currentIndex > 0 && (
        <button onClick={goPrev} className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-destructive/60 hover:text-destructive transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
      )}
      <button onClick={goNext} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-destructive/60 hover:text-destructive transition-colors">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="h-full"
        >
          <RealItem post={reals[currentIndex]} />
        </motion.div>
      </AnimatePresence>

      {/* Progress dots — red theme */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
        {reals.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, i) => {
          const realIdx = Math.max(0, currentIndex - 3) + i;
          return (
            <button
              key={realIdx}
              onClick={() => setCurrentIndex(realIdx)}
              className={`w-1.5 rounded-full transition-all ${
                realIdx === currentIndex ? "h-6 bg-destructive" : "h-1.5 bg-destructive/30"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RealsViewer;
