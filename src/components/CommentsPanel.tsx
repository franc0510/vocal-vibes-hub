import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Mic, Square, Play, Pause, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string | null;
  voice_url: string | null;
  created_at: string;
  author_name: string;
  author_avatar: string;
}

interface CommentsPanelProps {
  open: boolean;
  onClose: () => void;
  postId: string;
}

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
};

const VoiceComment = ({ url }: { url: string }) => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  return (
    <button onClick={toggle} className="flex items-center gap-1.5 bg-secondary rounded-full px-3 py-1.5">
      {playing ? <Pause size={12} className="text-primary" /> : <Play size={12} className="text-primary ml-0.5" />}
      <div className="flex gap-[2px]">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={`w-[2px] rounded-full ${playing ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} style={{ height: `${8 + Math.random() * 10}px` }} />
        ))}
      </div>
    </button>
  );
};

const CommentsPanel = ({ open, onClose, postId }: CommentsPanelProps) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const fetchComments = async () => {
    setLoading(true);
    const { data: rawComments } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (!rawComments) { setLoading(false); return; }

    const userIds = [...new Set(rawComments.map((c) => c.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", userIds);
    const pMap = new Map((profiles || []).map((p) => [p.id, p]));

    setComments(rawComments.map((c) => {
      const p = pMap.get(c.user_id);
      const initials = (p?.display_name || "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
      return { id: c.id, content: c.content, voice_url: c.voice_url, created_at: c.created_at, author_name: p?.display_name || "User", author_avatar: initials };
    }));
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchComments();
  }, [open, postId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        setRecordingBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true);
    } catch { toast.error("Microphone access denied"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    setRecording(false);
  };

  const sendComment = async () => {
    if (!user) return;
    if (!text.trim() && !recordingBlob) return;
    setSending(true);

    try {
      let voiceUrl: string | null = null;
      if (recordingBlob) {
        const fileName = `${user.id}/${Date.now()}.webm`;
        const { error } = await supabase.storage.from("voice_comments").upload(fileName, recordingBlob, { contentType: "audio/webm" });
        if (error) throw error;
        voiceUrl = supabase.storage.from("voice_comments").getPublicUrl(fileName).data.publicUrl;
      }

      const { error } = await supabase.from("comments").insert({
        post_id: postId,
        user_id: user.id,
        content: text.trim() || null,
        voice_url: voiceUrl,
      });
      if (error) throw error;

      setText("");
      setRecordingBlob(null);
      fetchComments();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl max-h-[70vh] flex flex-col max-w-lg mx-auto border-t border-border/50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
              <h3 className="text-sm font-bold font-display text-foreground">Comments</h3>
              <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {loading ? (
                <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : comments.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-10">No comments yet — be the first!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <div className="w-7 h-7 rounded-full gradient-red flex items-center justify-center text-[9px] font-bold text-primary-foreground shrink-0 mt-0.5">
                      {c.author_avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                        <span className="text-[10px] text-muted-foreground">{formatTime(c.created_at)}</span>
                      </div>
                      {c.content && <p className="text-xs text-foreground/80 mt-0.5">{c.content}</p>}
                      {c.voice_url && <div className="mt-1"><VoiceComment url={c.voice_url} /></div>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-3 border-t border-border/30 flex items-center gap-2">
              {recordingBlob ? (
                <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                  <span className="text-xs text-foreground">🎤 Voice ready</span>
                  <button onClick={() => setRecordingBlob(null)} className="text-xs text-destructive">Remove</button>
                </div>
              ) : (
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendComment()}
                  placeholder="Add a comment..."
                  className="flex-1 bg-secondary rounded-xl px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                />
              )}

              <button
                onClick={recording ? stopRecording : startRecording}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${recording ? "bg-primary" : "bg-secondary"}`}
              >
                {recording ? <Square size={12} className="text-primary-foreground" /> : <Mic size={14} className="text-muted-foreground" />}
              </button>

              <button
                onClick={sendComment}
                disabled={sending || (!text.trim() && !recordingBlob)}
                className="w-8 h-8 rounded-full gradient-red flex items-center justify-center shrink-0 disabled:opacity-40"
              >
                {sending ? <Loader2 size={14} className="text-primary-foreground animate-spin" /> : <Send size={14} className="text-primary-foreground" />}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommentsPanel;
