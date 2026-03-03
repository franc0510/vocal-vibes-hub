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
    <div className="min-h-screen pb-24 px-4 pt-4 flex flex-col">
      <header className="mb-6">
        <h1 className="text-2xl font-bold font-display text-gradient-red">Publier</h1>
        <p className="text-sm text-muted-foreground mt-1">Raconte ton anecdote du jour (45s max)</p>
      </header>

      {/* Daily prompt */}
      <div className="gradient-red-soft rounded-xl p-4 mb-8 border border-primary/10">
        <p className="text-sm font-medium text-foreground">💡 Sujet du jour :</p>
        <p className="text-base font-display font-bold text-foreground mt-1">
          Ton moment le plus gênant aujourd'hui ?
        </p>
      </div>

      {/* Record area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Timer */}
        <div className="mb-4 text-center">
          <span className="text-3xl font-display font-bold text-foreground">
            {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
          </span>
          <span className="text-lg text-muted-foreground"> / 0:45</span>
        </div>

        {/* Progress ring */}
        <div className="relative mb-6">
          <svg width="160" height="160" className="transform -rotate-90">
            <circle cx="80" cy="80" r="72" fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
            <circle
              cx="80" cy="80" r="72" fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 72}`}
              strokeDashoffset={`${2 * Math.PI * 72 * (1 - progress)}`}
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-16">
              <WaveformVisualizer bars={fakeBars} isPlaying={isRecording} size="lg" color={isRecording ? "coral" : "muted"} />
            </div>
          </div>
        </div>

        {/* Record button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsRecording(!isRecording)}
          className="relative"
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
            isRecording ? "bg-primary" : "gradient-red shadow-red"
          }`}>
            {isRecording ? (
              <Square size={28} className="text-primary-foreground" />
            ) : (
              <Mic size={32} className="text-primary-foreground" />
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

        <p className="text-sm text-muted-foreground mt-4">
          {isRecording ? `Enregistrement... ${MAX_DURATION - elapsed}s restantes` : "Appuie pour enregistrer"}
        </p>

        {/* Title input */}
        <input
          type="text"
          placeholder="Donne un titre à ton anecdote..."
          className="mt-8 w-full max-w-sm bg-card border border-border/50 rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow shadow-card"
        />

        {/* Publish */}
        <button className="mt-4 gradient-red text-primary-foreground px-8 py-3 rounded-xl font-medium shadow-red flex items-center gap-2 hover:opacity-90 transition-opacity">
          <Send size={18} />
          Publier mon anecdote
        </button>
      </div>
    </div>
  );
};

export default RecordPage;
