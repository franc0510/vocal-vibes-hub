import { useState } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Send } from "lucide-react";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { CATEGORIES } from "@/lib/mockData";

const RecordPage = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("life");
  const fakeBars = Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.85);

  return (
    <div className="min-h-screen pb-24 px-4 pt-4 flex flex-col">
      <header className="mb-6">
        <h1 className="text-2xl font-bold font-display text-gradient-coral">Publier</h1>
        <p className="text-sm text-muted-foreground mt-1">Enregistre ton vocal et partage-le</p>
      </header>

      {/* Category selector */}
      <div className="flex gap-2 mb-8">
        {CATEGORIES.filter((c) => c.id !== "all").map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? "gradient-coral text-primary-foreground shadow-coral"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Record area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Waveform preview */}
        <div className="mb-12 h-16">
          <WaveformVisualizer bars={fakeBars} isPlaying={isRecording} size="lg" color={isRecording ? "coral" : "muted"} />
        </div>

        {/* Record button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsRecording(!isRecording)}
          className="relative"
        >
          <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
            isRecording ? "bg-destructive" : "gradient-coral shadow-coral"
          }`}>
            {isRecording ? (
              <Square size={28} className="text-foreground" />
            ) : (
              <Mic size={32} className="text-primary-foreground" />
            )}
          </div>
          {isRecording && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-destructive"
              animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </motion.button>

        <p className="text-sm text-muted-foreground mt-4">
          {isRecording ? "Enregistrement en cours..." : "Appuie pour enregistrer"}
        </p>

        {/* Title input */}
        <input
          type="text"
          placeholder="Donne un titre à ton vocal..."
          className="mt-8 w-full max-w-sm bg-secondary rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
        />

        {/* Publish */}
        <button className="mt-4 gradient-coral text-primary-foreground px-8 py-3 rounded-xl font-medium shadow-coral flex items-center gap-2 hover:opacity-90 transition-opacity">
          <Send size={18} />
          Publier
        </button>
      </div>
    </div>
  );
};

export default RecordPage;
