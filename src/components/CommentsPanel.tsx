import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, Square, Play, Pause, Loader2, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { playExclusive, releaseAudio } from "@/lib/audioManager";

interface Comment {
  id: string;
  content: string | null;
  voice_url: string | null;
  created_at: string;
  author_name: string;
  author_avatar: string;
  likes_count: number;
  isLiked: boolean;
}

interface CommentsPanelProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  onCommentAdded?: () => void;
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
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number>(0);

  // Build the audio element only once (per URL change) so iOS can warm it up.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audio.src = url;
    audio.load();
    audio.onended = () => {
      setPlaying(false);
      setProgress(0);
      cancelAnimationFrame(rafRef.current);
      releaseAudio(audio);
    };
    audio.onpause = () => setPlaying(false);
    audio.onplay = () => setPlaying(true);
    audioRef.current = audio;
    return () => {
      audio.pause();
      releaseAudio(audio);
      audio.src = "";
      cancelAnimationFrame(rafRef.current);
    };
  }, [url]);

  const tick = () => {
    const a = audioRef.current;
    if (!a) return;
    const dur = a.duration || 1;
    setProgress(a.currentTime / dur);
    if (!a.paused) rafRef.current = requestAnimationFrame(tick);
  };

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;

    if (playing) {
      a.pause();
      releaseAudio(a);
      cancelAnimationFrame(rafRef.current);
      return;
    }

    setLoading(true);
    try {
      await playExclusive(a);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      toast.error("Impossible de lire ce vocal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 bg-secondary rounded-full px-3 py-1.5 hover:bg-secondary/80 transition-colors max-w-full"
    >
      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
        {loading ? (
          <Loader2 size={10} className="text-primary-foreground animate-spin" />
        ) : playing ? (
          <Pause size={10} className="text-primary-foreground" />
        ) : (
          <Play size={10} className="text-primary-foreground ml-[1px]" />
        )}
      </div>
      <div className="flex items-center gap-[2px] flex-1 h-4 overflow-hidden">
        {Array.from({ length: 14 }, (_, i) => {
          const barHeight = 4 + ((i * 37) % 10);
          const active = playing && progress * 14 >= i;
          return (
            <div
              key={i}
              className={`w-[2px] rounded-full transition-colors ${
                active ? "bg-primary" : "bg-muted-foreground/40"
              }`}
              style={{ height: `${barHeight}px` }}
            />
          );
        })}
      </div>
    </button>
  );
};

const CommentsPanel = ({ open, onClose, postId, onCommentAdded }: CommentsPanelProps) => {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
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

    // Fetch like counts and current user likes for all comments
    const commentIds = rawComments.map((c) => c.id);
    let likeCounts = new Map<string, number>();
    let myLikes = new Set<string>();

    if (commentIds.length > 0) {
      // Get counts per comment
      const { data: allLikes } = await (supabase as any)
        .from("comment_likes")
        .select("comment_id")
        .in("comment_id", commentIds);

      if (allLikes) {
        for (const like of allLikes as any[]) {
          likeCounts.set(like.comment_id, (likeCounts.get(like.comment_id) || 0) + 1);
        }
      }

      // Get current user's likes
      if (user) {
        const { data: userLikes } = await (supabase as any)
          .from("comment_likes")
          .select("comment_id")
          .eq("user_id", user.id)
          .in("comment_id", commentIds);
        if (userLikes) {
          for (const like of userLikes as any[]) myLikes.add(like.comment_id);
        }
      }
    }

    setComments(rawComments.map((c) => {
      const p = pMap.get(c.user_id);
      const initials = (p?.display_name || "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
      return {
        id: c.id,
        content: c.content,
        voice_url: c.voice_url,
        created_at: c.created_at,
        author_name: p?.display_name || "User",
        author_avatar: initials,
        likes_count: likeCounts.get(c.id) || 0,
        isLiked: myLikes.has(c.id),
      };
    }));
    setLoading(false);
  };

  const toggleCommentLike = async (commentId: string) => {
    if (!user) { toast.error("Sign in to like"); return; }
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    const newLiked = !comment.isLiked;
    // Optimistic update
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, isLiked: newLiked, likes_count: newLiked ? c.likes_count + 1 : Math.max(0, c.likes_count - 1) }
          : c
      )
    );

    try {
      if (newLiked) {
        await (supabase as any).from("comment_likes").insert({ comment_id: commentId, user_id: user.id });
      } else {
        await (supabase as any).from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", user.id);
      }
    } catch {
      // Revert on error
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, isLiked: !newLiked, likes_count: !newLiked ? c.likes_count + 1 : Math.max(0, c.likes_count - 1) }
            : c
        )
      );
    }
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
    if (!recordingBlob) return;
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
        content: null,
        voice_url: voiceUrl,
      });
      if (error) throw error;

      setRecordingBlob(null);
      onCommentAdded?.();
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-background/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[71] bg-card rounded-t-2xl flex flex-col max-w-lg mx-auto border-t border-border/50"
            style={{ maxHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/30 shrink-0">
              <h3 className="text-sm font-bold font-display text-foreground">Comments</h3>
              <button onClick={onClose} className="text-muted-foreground" aria-label="Close comments"><X size={18} /></button>
            </div>

            {/* Comments list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
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
                    <button
                      onClick={() => toggleCommentLike(c.id)}
                      className="flex flex-col items-center gap-0.5 shrink-0 pt-1"
                    >
                      <Heart
                        size={14}
                        className={c.isLiked ? "fill-primary text-primary" : "text-muted-foreground"}
                      />
                      {c.likes_count > 0 && (
                        <span className={`text-[9px] font-medium ${c.isLiked ? "text-primary" : "text-muted-foreground"}`}>
                          {c.likes_count}
                        </span>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Voice-only input */}
            <div
              className="px-4 py-3 border-t border-border/30 flex items-center gap-2 shrink-0 bg-card"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
            >
              {recordingBlob ? (
                <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2">
                  <Mic size={14} className="text-primary shrink-0" />
                  <div className="flex gap-[2px] flex-1 items-center h-4">
                    {Array.from({ length: 16 }, (_, i) => (
                      <div key={i} className="w-[2px] rounded-full bg-primary" style={{ height: `${4 + Math.random() * 8}px` }} />
                    ))}
                  </div>
                  <span className="text-xs text-primary font-medium">Ready</span>
                  <button onClick={() => setRecordingBlob(null)} className="text-xs text-destructive ml-1">✕</button>
                </div>
              ) : (
                <div className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-2 ${recording ? "bg-primary/10 border border-primary/30" : "bg-secondary"}`}>
                  <Mic size={13} className={recording ? "text-primary" : "text-muted-foreground"} />
                  <span className={`text-xs ${recording ? "text-primary animate-pulse" : "text-muted-foreground"}`}>
                    {recording ? "Recording… tap ■ to stop" : "Tap mic to record a voice comment"}
                  </span>
                </div>
              )}

              <button
                onPointerDown={!recordingBlob && !recording ? startRecording : undefined}
                onClick={recording ? stopRecording : undefined}
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  recording ? "bg-destructive scale-110" : recordingBlob ? "bg-secondary" : "bg-primary"
                }`}
              >
                {recording ? <Square size={12} className="text-white" /> : <Mic size={14} className={recordingBlob ? "text-muted-foreground" : "text-primary-foreground"} />}
              </button>

              {recordingBlob && (
                <button
                  onClick={sendComment}
                  disabled={sending}
                  className="w-9 h-9 rounded-full gradient-red flex items-center justify-center shrink-0 disabled:opacity-40"
                >
                  {sending ? <Loader2 size={13} className="text-primary-foreground animate-spin" /> : <Mic size={14} className="text-primary-foreground" />}
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommentsPanel;
