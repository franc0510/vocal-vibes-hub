import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Send } from "lucide-react";
import WaveformVisualizer from "@/components/WaveformVisualizer";

const MAX_DURATION = 45;

const RecordPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fakeBars = Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.85);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev >= MAX_DURATION - 1) {
            setIsRecording(false);
            return MAX_DURATION;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRecording]);

  const progress = elapsed / MAX_DURATION;

  return (
    <div className="h-screen pb-20 px-4 pt-4 flex flex-col">
      <header className="mb-2">
        <h1 className="text-xl font-bold font-display text-gradient-red text-center">VocMe</h1>
      </header>

      <div className="gradient-red-soft rounded-xl p-3 mb-3 border border-primary/10">
        <p className="text-xs font-medium text-foreground">💡 Today's topic:</p>
        <p className="text-sm font-display font-bold text-foreground mt-0.5">
          Your most embarrassing moment today?
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="mb-2 text-center">
          <span className="text-2xl font-display font-bold text-foreground">
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </span>
          <span className="text-sm text-muted-foreground"> / 0:45</span>
        </div>

        <div className="relative mb-3">
          <svg width="130" height="130" className="transform -rotate-90">
            <circle cx="65" cy="65" r="58" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
            <circle
              cx="65" cy="65" r="58" fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 58}`}
              strokeDashoffset={`${2 * Math.PI * 58 * (1 - progress)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12">
              <WaveformVisualizer bars={fakeBars} isPlaying={isRecording} size="md" color={isRecording ? "coral" : "muted"} />
            </div>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsRecording(!isRecording)}
          className="relative mb-2"
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            isRecording ? "bg-primary" : "gradient-red shadow-red"
          }`}>
            {isRecording ? (
              <Square size={24} className="text-primary-foreground" />
            ) : (
              <Mic size={28} className="text-primary-foreground" />
            )}
          </div>
          {isRecording && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary"
              animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.button>

        <p className="text-xs text-muted-foreground mb-3">
          {isRecording ? `${MAX_DURATION - elapsed}s remaining` : "Tap to record"}
        </p>

        <input
          type="text"
          placeholder="Give your story a title..."
          className="w-full max-w-xs bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow shadow-card mb-3"
        />

        <button className="gradient-red text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium shadow-red flex items-center gap-2 hover:opacity-90 transition-opacity">
          <Send size={16} />
          Publish
        </button>
      </div>
    </div>
  );
};

export default RecordPage;
