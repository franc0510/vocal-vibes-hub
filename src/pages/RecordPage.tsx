import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const MAX_DURATION = 45;

const RecordPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev >= MAX_DURATION - 1) {
            stopRecording();
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioBlob(null);
    } catch {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handlePublish = async () => {
    if (!user) {
      toast.error("You need to sign in first");
      navigate("/auth");
      return;
    }
    if (!audioBlob) {
      toast.error("Record something first!");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a title to your story");
      return;
    }

    setPublishing(true);
    try {
      const fileName = `${user.id}/${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from("audio")
        .upload(fileName, audioBlob, { contentType: "audio/webm" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("audio").getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("voice_posts").insert({
        user_id: user.id,
        title: title.trim(),
        audio_url: urlData.publicUrl,
        duration: elapsed,
      });

      if (insertError) throw insertError;

      toast.success("Published! 🎉");
      setTitle("");
      setAudioBlob(null);
      setElapsed(0);
      
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

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
          onClick={toggleRecording}
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
          {isRecording ? `${MAX_DURATION - elapsed}s remaining` : audioBlob ? "Ready to publish!" : "Tap to record"}
        </p>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give your story a title..."
          className="w-full max-w-xs bg-card border border-border/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50 transition-shadow shadow-card mb-3"
        />

        <button
          onClick={handlePublish}
          disabled={publishing || !audioBlob || !title.trim()}
          className="gradient-red text-primary-foreground px-6 py-2.5 rounded-xl text-sm font-medium shadow-red flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          {publishing ? "Publishing..." : "Publish"}
        </button>
      </div>
    </div>
  );
};

export default RecordPage;
