import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Send, Loader2, MicOff, AlertCircle, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMicrophone } from "@/hooks/useMicrophone";

const MAX_DURATION = 45;

// Forcer MP4/AAC sur tous les navigateurs
const getSupportedMimeType = () => {
  const types = [
    "audio/mp4",
    "audio/aac",
    "audio/webm;codecs=opus",
    "audio/webm",
  ];
  
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      console.log("✅ Using MIME type:", type);
      return type;
    }
  }
  
  // Fallback : retourner "" et laisser le navigateur décider (généralement MP4 sur iOS)
  console.log("⚠️ No MIME type supported, using default");
  return "";
};

const RecordPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { status: micStatus, error: micError, requestAccess, stream: micStream } = useMicrophone(true); // autoRequest = true
  
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fakeBars = useRef(Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.85)).current;

  const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone);

  useEffect(() => {
    if (micStatus === "denied" && !isRecording) {
      if (isStandalone && isIOS) {
        toast.error("Microphone refusé", {
          description: "Fermez l'app, allez dans Réglages > VocMe > Microphone, activez-le, puis rouvrez l'app",
          duration: 10000,
        });
      } else if (isIOS) {
        toast.error("Microphone refusé", {
          description: "Ajoutez VocMe à l'écran d'accueil pour un meilleur accès au micro",
          duration: 8000,
        });
      } else {
        toast.error("Microphone refusé", {
          description: "Cliquez sur 🔒 dans la barre d'adresse",
          duration: 6000,
        });
      }
    }
  }, [micStatus, isRecording, isIOS, isStandalone]);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev >= MAX_DURATION - 1) { stopRecording(); return MAX_DURATION; }
          return prev + 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRecording]);

  const startRecording = async () => {
    let stream: MediaStream | null = null;
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } else {
        stream = await requestAccess();
      }
    } catch {
      stream = await requestAccess();
    }
    if (!stream) return;

    try {
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : {}; // Sur iOS, {} = MP4 par défaut
      
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        // iOS enregistre en MP4 par défaut
        const actualMimeType = mediaRecorder.mimeType || "audio/mp4";
        console.log("📦 Recording complete. MIME type:", actualMimeType);
        setAudioBlob(new Blob(chunksRef.current, { type: actualMimeType }));
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setAudioBlob(null);
    } catch (err) {
      toast.error("Erreur lors du démarrage");
      console.error(err);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setIsRecording(false);
  };

  const toggleRecording = () => { if (isRecording) stopRecording(); else startRecording(); };

  const handlePublish = async () => {
    if (!user) { toast.error("You need to sign in first"); navigate("/auth"); return; }
    if (!audioBlob) { toast.error("Record something first!"); return; }
    if (elapsed < 3) { toast.error("Recording must be at least 3 seconds"); return; }
    if (!title.trim()) { toast.error("Add a title to your story"); return; }

    setPublishing(true);
    try {
      // Déterminer l'extension depuis le type MIME
      let ext = "mp4"; // Par défaut MP4
      if (audioBlob.type.includes("webm")) ext = "webm";
      else if (audioBlob.type.includes("ogg")) ext = "ogg";
      else if (audioBlob.type.includes("aac")) ext = "aac";

      const fileName = `${user.id}/${Date.now()}.${ext}`;
      console.log("📤 Uploading:", fileName, "Type:", audioBlob.type);
      
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, audioBlob, { contentType: audioBlob.type || "audio/mp4" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);
      const { error: insertError } = await supabase.from("voice_posts").insert({
        user_id: user.id,
        title: title.trim(),
        audio_url: urlData.publicUrl,
        duration: elapsed,
      } as any);
      if (insertError) throw insertError;

      toast.success("Published! 🎉");
      setTitle(""); setAudioBlob(null); setElapsed(0);
      navigate("/");
    } catch (err: any) { toast.error(err.message || "Failed to publish"); }
    finally { setPublishing(false); }
  };

  const progress = elapsed / MAX_DURATION;

  return (
    <div
      className="w-full h-full px-4 flex flex-col overflow-hidden"
      style={{
        paddingTop: "12px",
        paddingBottom: "env(safe-area-inset-bottom, 56px)",
      }}
    >
      <header className="mb-2">
        <h1 className="text-lg font-bold font-display text-gradient-red text-center">VocMe</h1>
      </header>

      {micStatus !== "granted" && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={requestAccess}
          disabled={micStatus === "requesting"}
          className="w-full bg-primary/20 border border-primary/50 rounded-xl p-4 mb-3 flex flex-col items-center gap-2 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {micStatus === "requesting" ? (
            <div className="flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-primary" />
              <span className="text-sm font-medium text-primary">Demande d'accès...</span>
            </div>
          ) : micStatus === "denied" ? (
            <>
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-destructive" />
                <span className="text-sm font-medium text-destructive">Microphone refusé</span>
              </div>
              <span className="text-xs text-destructive/70 text-center">
                {isStandalone && isIOS
                  ? "Fermez VocMe → Réglages → VocMe → Microphone → Activez"
                  : isIOS ? "Ajoutez VocMe à l'écran d'accueil" : "Appuyez pour réessayer"}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Mic size={18} className="text-primary" />
              <span className="text-sm font-medium text-primary">Appuyez pour autoriser le microphone 🎤</span>
            </div>
          )}
        </motion.button>
      )}

      {!isStandalone && isIOS && micStatus === "denied" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mb-3">
          <p className="text-sm font-medium text-blue-400 mb-1">💡 Conseil</p>
          <p className="text-xs text-blue-300/80">Appuyez sur <strong>Partager</strong> (⬆️) → <strong>Sur l'écran d'accueil</strong></p>
        </motion.div>
      )}

      <div className="gradient-red-soft rounded-xl p-3 mb-3 border border-primary/10">
        <p className="text-xs font-medium text-foreground">💡 Today's topic:</p>
        <p className="text-sm font-display font-bold text-foreground mt-0.5">Your most embarrassing moment today?</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="mb-2 text-center">
          <span className="text-2xl font-display font-bold text-foreground">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}</span>
          <span className="text-sm text-muted-foreground"> / 0:45</span>
        </div>

        <div className="relative mb-3">
          <svg width="130" height="130" className="transform -rotate-90">
            <circle cx="65" cy="65" r="58" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
            <circle cx="65" cy="65" r="58" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 58}`} strokeDashoffset={`${2 * Math.PI * 58 * (1 - progress)}`} className="transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-12"><WaveformVisualizer bars={fakeBars} isPlaying={isRecording} size="md" color={isRecording ? "coral" : "muted"} /></div>
          </div>
        </div>

        <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRecording} disabled={micStatus !== "granted"} className="relative mb-2">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${micStatus !== "granted" ? "bg-muted" : isRecording ? "bg-primary" : "gradient-red shadow-red"}`}>
            {micStatus !== "granted" ? <MicOff size={24} className="text-muted-foreground" /> : isRecording ? <Square size={24} className="text-primary-foreground" /> : <Mic size={28} className="text-primary-foreground" />}
          </div>
          {isRecording && <motion.div className="absolute inset-0 rounded-full border-2 border-primary" animate={{ scale: [1, 1.4], opacity: [0.6, 0] }} transition={{ duration: 1, repeat: Infinity }} />}
        </motion.button>

        <p className="text-xs text-muted-foreground mb-3 text-center">
          {micStatus !== "granted" ? "Microphone non autorisé" : isRecording ? `${MAX_DURATION - elapsed}s remaining` : audioBlob ? "Ready to publish!" : "Appuyez pour enregistrer"}
        </p>

        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Give your story a title..." className="w-full max-w-xs bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow shadow-card mb-3" />

        <div className="flex items-center gap-3 mb-3 bg-card border border-border/50 rounded-xl px-4 py-2.5 w-full max-w-xs">
          <button onClick={() => setVisibility("public")} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${visibility === "public" ? "gradient-red text-primary-foreground shadow-red" : "text-muted-foreground"}`}>🌍 Public</button>
          <button onClick={() => setVisibility("private")} className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${visibility === "private" ? "gradient-red text-primary-foreground shadow-red" : "text-muted-foreground"}`}>🔒 Friends</button>
        </div>

        <button onClick={handlePublish} disabled={publishing || !audioBlob || !title.trim()} className="gradient-red text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium shadow-red flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50">
          {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {publishing ? "Publishing..." : "Publish"}
        </button>

        {/* Spacer pour la navbar */}
        <div className="h-24" />
      </div>
    </div>
  );
};

export default RecordPage;