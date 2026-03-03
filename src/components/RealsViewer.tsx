import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Play } from "lucide-react";
import WaveformVisualizer from "./WaveformVisualizer";
import { mockReals, type VoicePost, REACTION_EMOJIS } from "@/lib/mockData";

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
    reactions: Object.fromEntries(
      REACTION_EMOJIS.filter(() => Math.random() > 0.4).map((e) => [e, Math.floor(Math.random() * 200)])
    ),
  };
};

const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString());

const RealItem = ({ post }: { post: VoicePost }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [reactions, setReactions] = useState(post.reactions);

  const toggleLike = () => {
    setLiked(!liked);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  const addReaction = (emoji: string) => {
    setReactions((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center relative px-6">
      {/* Pulsating ring */}
      <div className="relative mb-6">
        <motion.div
          className="w-36 h-36 rounded-full gradient-red flex items-center justify-center cursor-pointer relative z-10 shadow-red"
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          <div className="w-32 h-32 rounded-full bg-card flex items-center justify-center">
            <div className="w-28 h-28 rounded-full bg-primary/10 absolute" />
            {isPlaying ? (
              <WaveformVisualizer bars={post.waveform.slice(0, 16)} isPlaying={true} size="lg" color="coral" />
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
        </div>
      </div>

      {/* Reactions */}
      <div className="flex flex-wrap justify-center gap-1.5 mb-4">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => addReaction(emoji)}
            className="flex items-center gap-1 bg-card hover:bg-primary/10 border border-border/50 px-2.5 py-1 rounded-full text-xs transition-colors"
          >
            <span>{emoji}</span>
            {reactions[emoji] ? <span className="text-muted-foreground">{reactions[emoji]}</span> : null}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-8">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <motion.div whileTap={{ scale: 1.4 }}>
            <Heart size={24} className={liked ? "fill-primary text-primary" : "text-muted-foreground"} />
          </motion.div>
          <span className={`text-xs ${liked ? "text-primary" : "text-muted-foreground"}`}>{formatCount(likeCount)}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <MessageCircle size={24} />
          <span className="text-xs">{formatCount(post.comments)}</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-muted-foreground">
          <Share2 size={24} />
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

  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 50) goNext();
    else if (diff < -50) goPrev();
  };

  return (
    <div
      ref={containerRef}
      className="h-[calc(100vh-8rem)] relative overflow-hidden rounded-2xl bg-card border border-primary/10 shadow-card"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {currentIndex > 0 && (
        <button onClick={goPrev} className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-primary/40 hover:text-primary transition-colors">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
        </button>
      )}
      <button onClick={goNext} className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 text-primary/40 hover:text-primary transition-colors">
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

      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-20">
        {reals.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, i) => {
          const realIdx = Math.max(0, currentIndex - 3) + i;
          return (
            <button
              key={realIdx}
              onClick={() => setCurrentIndex(realIdx)}
              className={`w-1.5 rounded-full transition-all ${
                realIdx === currentIndex ? "h-6 bg-primary" : "h-1.5 bg-primary/25"
              }`}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RealsViewer;
