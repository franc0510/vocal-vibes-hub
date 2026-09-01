import { useRef, useState } from "react";
import { Play, Pause, Gauge } from "lucide-react";
import { playExclusive, releaseAudio } from "@/lib/audioManager";

/**
 * Un bouton de lecture et son sélecteur de vitesse.
 *
 * Extrait de `WeeklyPage`, où il vivait en local, pour que l'urne d'une
 * compétition écoute les anecdotes avec exactement le même objet : deux
 * lecteurs concurrents finiraient par diverger sur la vitesse, la reprise, ou
 * le fait de couper l'audio en cours ailleurs dans l'application.
 *
 * `playExclusive` est ce qui garantit ce dernier point : une seule anecdote
 * joue à la fois, quel que soit l'écran.
 */
const MiniPlayer = ({ url }: { url: string }) => {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const ref = useRef<HTMLAudioElement | null>(null);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ref.current) {
      ref.current = new Audio(url);
      ref.current.onended = () => { setPlaying(false); releaseAudio(ref.current); };
      ref.current.onpause = () => setPlaying(false);
      ref.current.onplay = () => setPlaying(true);
    }
    ref.current.playbackRate = speed;
    if (playing) { ref.current.pause(); releaseAudio(ref.current); }
    else { playExclusive(ref.current); }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSpeed((prev) => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (ref.current) ref.current.playbackRate = next;
      return next;
    });
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <button onClick={toggle} className="w-10 h-10 rounded-full gradient-red flex items-center justify-center shadow-red shrink-0">
        {playing ? <Pause size={16} className="text-primary-foreground" /> : <Play size={16} className="text-primary-foreground ml-0.5" />}
      </button>
      <button
        onClick={cycleSpeed}
        className={`flex items-center gap-0.5 px-1.5 py-1 rounded-full border transition-colors ${speed > 1 ? "bg-primary/20 border-primary/50 text-primary" : "bg-secondary border-border/30 text-muted-foreground"}`}
      >
        <Gauge size={11} />
        <span className="text-[10px] font-bold">{speed}x</span>
      </button>
    </div>
  );
};

export default MiniPlayer;
