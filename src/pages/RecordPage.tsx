import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Send, Loader2, MicOff, AlertCircle, Settings, Image as ImageIcon, MapPin, Play, Pause, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useGroups, type Group } from "@/hooks/useGroups";
import { transcribeAudio } from "@/services/transcriptionService";

const MAX_DURATION = 120;

// Daily topics (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
const DAILY_TOPICS: Record<number, string> = {
  1: "Your most fun moment from last week?",
  2: "Your most embarrassing moment?",
  3: "Your biggest shine moment?",
  4: "The funniest story about a friend?",
  5: "The funniest party story?",
  6: "Your juiciest anecdote — Saturday's night!",
  0: "What's your Sunday ritual?",
};

const getTodayTopic = () => {
  const day = new Date().getDay();
  return DAILY_TOPICS[day] || "Tell us your best anecdote!";
};

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
  const { groups } = useGroups();
  
  const [isRecording, setIsRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "friends" | "group">("public");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // New: photo, location, replay, transcription, confirm-delete
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState("");
  const [transcription, setTranscription] = useState("");
  const [isReplaying, setIsReplaying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
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

  // Re-clicking the mic button after a recording exists asks to delete first
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else if (audioBlob) {
      // Ask for confirmation before discarding the existing recording
      setConfirmDelete(true);
    } else {
      startRecording();
    }
  };

  const discardRecording = () => {
    stopReplay();
    setAudioBlob(null);
    setElapsed(0);
    setConfirmDelete(false);
    startRecording();
  };

  // Replay the recorded blob before publishing
  const toggleReplay = () => {
    if (!audioBlob) return;
    if (isReplaying) {
      stopReplay();
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    replayAudioRef.current = audio;
    audio.onended = () => { setIsReplaying(false); URL.revokeObjectURL(url); };
    audio.play().then(() => setIsReplaying(true)).catch(() => toast.error("Lecture impossible"));
  };

  const stopReplay = () => {
    if (replayAudioRef.current) {
      replayAudioRef.current.pause();
      replayAudioRef.current = null;
    }
    setIsReplaying(false);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Choisissez une image"); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const detectLocation = () => {
    if (!navigator.geolocation) { toast.error("Géolocalisation non disponible"); return; }
    toast.loading("Localisation…", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`);
          const data = await res.json();
          const place = data.address?.city || data.address?.town || data.address?.village || data.address?.county || data.address?.country || "";
          setLocation(place);
          toast.success(place ? `📍 ${place}` : "Localisation ajoutée", { id: "geo" });
        } catch {
          toast.error("Impossible de récupérer le lieu", { id: "geo" });
        }
      },
      () => toast.error("Localisation refusée", { id: "geo" }),
      { timeout: 8000 }
    );
  };

  const handlePublish = async () => {
    if (!user) { toast.error("You need to sign in first"); navigate("/auth"); return; }
    if (!audioBlob) { toast.error("Record something first!"); return; }
    if (elapsed < 3) { toast.error("Recording must be at least 3 seconds"); return; }
    if (!title.trim()) { toast.error("Add a title to your story"); return; }
    if (visibility === "group" && !selectedGroupId) { toast.error("Select a group"); return; }

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

      // Upload optional background photo
      let imageUrl: string | null = null;
      if (imageFile) {
        const imgExt = imageFile.name.split(".").pop() || "jpg";
        const imgPath = `${user.id}/${Date.now()}.${imgExt}`;
        const { error: imgErr } = await supabase.storage
          .from("voice_images")
          .upload(imgPath, imageFile, { contentType: imageFile.type });
        if (!imgErr) {
          imageUrl = supabase.storage.from("voice_images").getPublicUrl(imgPath).data.publicUrl;
        }
      }

      const { data: insertData, error: insertError } = await supabase.from("voice_posts").insert({
        user_id: user.id,
        title: title.trim(),
        audio_url: urlData.publicUrl,
        duration: elapsed,
        image_url: imageUrl,
        location: location.trim() || null,
        transcription: transcription.trim() || null,
        ...(visibility === "group" && selectedGroupId ? { group_id: selectedGroupId } : {}),
      } as any).select().single();
      if (insertError) throw insertError;

      toast.success("Published! 🎉");
      setTitle(""); setAudioBlob(null); setElapsed(0);
      setImageFile(null); setImagePreview(null); setLocation(""); setTranscription("");
      
      // Start automatic transcription in background (if no manual transcription provided)
      if (!transcription.trim() && insertData?.id) {
        console.log("🎤 Starting automatic transcription in background...");
        transcribeAudio(urlData.publicUrl, insertData.id).catch((err) => {
          console.error("⚠️ Automatic transcription failed:", err);
          // Don't show error to user - it's a background process
        });
      }
      
      navigate("/");
    } catch (err: any) { toast.error(err.message || "Failed to publish"); }
    finally { setPublishing(false); }
  };

  const progress = elapsed / MAX_DURATION;

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
        paddingLeft: "16px",
        paddingRight: "16px",
      }}
    >
      <header className="mb-2 shrink-0">
        <h1 className="text-lg font-bold font-display text-gradient-red text-center">VocMe</h1>
      </header>

      {micStatus !== "granted" && (
        <motion.button
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={requestAccess}
          disabled={micStatus === "requesting"}
          className="w-full bg-primary/20 border border-primary/50 rounded-xl p-2 mb-2 flex flex-col items-center gap-1 hover:bg-primary/30 transition-colors disabled:opacity-50 shrink-0"
        >
          {micStatus === "requesting" ? (
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-primary" />
              <span className="text-xs font-medium text-primary">Requesting access...</span>
            </div>
          ) : micStatus === "denied" ? (
            <>
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-destructive" />
                <span className="text-xs font-medium text-destructive">Microphone denied</span>
              </div>
              <span className="text-[10px] text-destructive/70 text-center">
                {isStandalone && isIOS
                  ? "Settings → VocMe → Microphone"
                  : isIOS ? "Add VocMe to Home Screen" : "Tap to retry"}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Mic size={16} className="text-primary" />
              <span className="text-xs font-medium text-primary">Tap to allow microphone</span>
            </div>
          )}
        </motion.button>
      )}

      <div className="gradient-red-soft rounded-xl px-3 py-2 mb-2 border border-primary/10 shrink-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Today's topic</p>
        <p className="text-xs font-display font-bold text-foreground leading-snug">{getTodayTopic()}</p>
      </div>

      {/* Main recording area — fills remaining space with balanced layout */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 overflow-hidden">
        {/* Timer + circular waveform */}
        <div className="flex flex-col items-center shrink-0">
          <div className="text-center">
            <span className="text-2xl font-display font-bold text-foreground tabular-nums">{Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}</span>
            <span className="text-xs text-muted-foreground ml-1">/ 2:00</span>
          </div>

          <div className="relative my-1">
            <svg width="110" height="110" className="transform -rotate-90">
              <circle cx="55" cy="55" r="48" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
              <circle cx="55" cy="55" r="48" fill="none" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 48}`} strokeDashoffset={`${2 * Math.PI * 48 * (1 - progress)}`} className="transition-all duration-1000" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10"><WaveformVisualizer bars={fakeBars} isPlaying={isRecording} size="md" color={isRecording ? "coral" : "muted"} /></div>
            </div>
          </div>

          <motion.button whileTap={{ scale: 0.9 }} onClick={toggleRecording} disabled={micStatus !== "granted"} className="relative mt-1">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${micStatus !== "granted" ? "bg-muted" : isRecording ? "bg-primary" : "gradient-red shadow-red"}`}>
              {micStatus !== "granted" ? <MicOff size={22} className="text-muted-foreground" /> : isRecording ? <Square size={22} className="text-primary-foreground" /> : <Mic size={24} className="text-primary-foreground" />}
            </div>
            {isRecording && <motion.div className="absolute inset-0 rounded-full border-2 border-primary" animate={{ scale: [1, 1.4], opacity: [0.6, 0] }} transition={{ duration: 1, repeat: Infinity }} />}
          </motion.button>

          <p className="text-[10px] text-muted-foreground text-center mt-1">
            {micStatus !== "granted" ? "Microphone not allowed" : isRecording ? `${MAX_DURATION - elapsed}s remaining` : audioBlob ? "Ready to publish!" : "Tap to record"}
          </p>

          {/* Replay recorded audio before publishing */}
          {audioBlob && !isRecording && (
            <button
              onClick={toggleReplay}
              className="flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-3 py-1 text-xs font-medium text-foreground mt-1 shadow-card hover:bg-secondary/50 transition-colors"
            >
              {isReplaying ? <Pause size={12} className="text-primary" /> : <Play size={12} className="text-primary ml-0.5" />}
              {isReplaying ? "Pause" : "Listen"}
            </button>
          )}
        </div>

        {/* Form area — flex-1 so it adapts vertically */}
        <div className="w-full max-w-xs flex flex-col gap-1.5 shrink">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title…"
            className="w-full bg-card border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 shadow-card"
          />

          {/* Optional transcription / extra text */}
          <textarea
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Transcription (optional)…"
            rows={1}
            className="w-full bg-card border border-border/50 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 shadow-card resize-none"
          />

          {/* Photo background + location */}
          <div className="flex items-stretch gap-1.5">
            <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            {imagePreview ? (
              <div className="relative w-9 h-9 rounded-lg overflow-hidden border border-border/50 shrink-0">
                <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-0 right-0 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <X size={9} className="text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => imageInputRef.current?.click()}
                className="w-9 h-9 rounded-lg bg-card border border-border/50 flex items-center justify-center shrink-0 hover:bg-secondary/50 transition-colors"
                aria-label="Add photo"
              >
                <ImageIcon size={14} className="text-muted-foreground" />
              </button>
            )}

            <div className="flex-1 flex items-center gap-1.5 bg-card border border-border/50 rounded-lg px-2">
              <button onClick={detectLocation} aria-label="Detect location" className="shrink-0">
                <MapPin size={13} className="text-primary" />
              </button>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location…"
                className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none min-w-0"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 bg-card border border-border/50 rounded-lg px-1.5 py-1">
            <button onClick={() => { setVisibility("public"); setSelectedGroupId(null); }} className={`flex-1 text-[11px] font-medium py-1 rounded-md transition-colors ${visibility === "public" ? "gradient-red text-primary-foreground shadow-red" : "text-muted-foreground"}`}>Public</button>
            <button onClick={() => { setVisibility("friends"); setSelectedGroupId(null); }} className={`flex-1 text-[11px] font-medium py-1 rounded-md transition-colors ${visibility === "friends" ? "gradient-red text-primary-foreground shadow-red" : "text-muted-foreground"}`}>Friends</button>
            <button onClick={() => setVisibility("group")} className={`flex-1 text-[11px] font-medium py-1 rounded-md transition-colors ${visibility === "group" ? "gradient-red text-primary-foreground shadow-red" : "text-muted-foreground"}`}>Group</button>
          </div>

          {visibility === "group" && (
            groups.length === 0 ? (
              <button onClick={() => navigate("/groups")} className="text-[11px] text-primary underline">
                Create a group first →
              </button>
            ) : (
              <select
                value={selectedGroupId || ""}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
                className="w-full bg-card border border-border/50 rounded-lg px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select a group...</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )
          )}

          <button onClick={handlePublish} disabled={publishing || !audioBlob || !title.trim()} className="gradient-red text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium shadow-red flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50">
            {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
      </div>

      {/* Confirm-delete popup before discarding an existing recording */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm"
              onClick={() => setConfirmDelete(false)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="fixed inset-0 z-[81] flex items-center justify-center px-6"
            >
              <div className="bg-card rounded-2xl p-5 w-full max-w-xs border border-border/50 shadow-elevated">
                <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-3">
                  <Trash2 size={22} className="text-destructive" />
                </div>
                <h3 className="text-base font-bold font-display text-foreground text-center mb-1">Delete this recording?</h3>
                <p className="text-xs text-muted-foreground text-center mb-4">
                  Your current VocMe will be discarded and you'll start a new recording.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-medium text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={discardRecording}
                    className="flex-1 py-2.5 rounded-xl bg-destructive text-sm font-medium text-white"
                  >
                    Delete & re-record
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RecordPage;