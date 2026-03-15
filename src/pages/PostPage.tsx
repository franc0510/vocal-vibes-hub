import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, Share2, Play, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import CommentsPanel from "@/components/CommentsPanel";
import SharePanel from "@/components/SharePanel";

const generateWaveform = () => Array.from({ length: 32 }, () => 0.15 + Math.random() * 0.85);
const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
const formatCount = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString());
const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const PostPage = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [post, setPost] = useState<any>(null);
  const [author, setAuthor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const waveform = useRef(generateWaveform()).current;

  useEffect(() => {
    if (!postId) return;
    const load = async () => {
      setLoading(true);
      const { data: p } = await supabase.from("voice_posts").select("*").eq("id", postId).single();
      if (!p) { setLoading(false); return; }
      setPost(p);
      setLikeCount(p.likes_count);

      const { data: profile } = await supabase.from("profiles").select("*").eq("id", p.user_id).single();
      setAuthor(profile);

      if (user) {
        const { data: like } = await supabase.from("voice_post_likes").select("id").eq("user_id", user.id).eq("post_id", postId).maybeSingle();
        setLiked(!!like);
      }
      setLoading(false);
    };
    load();
  }, [postId, user?.id]);

  const updateProgress = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
      if (!audioRef.current.paused) {
        animRef.current = requestAnimationFrame(updateProgress);
      }
    }
  };

  const togglePlay = async () => {
    if (!post || !audioRef.current) return;

    const audio = audioRef.current;

    try {
      if (playing) {
        audio.pause();
        cancelAnimationFrame(animRef.current);
        setPlaying(false);
      } else {
        // Charger l'audio avec CORS
        if (!audio.src || audio.src !== post.audio_url) {
          audio.src = post.audio_url;
          audio.crossOrigin = "anonymous";
          audio.load();
          // Attendre que les métadonnées soient chargées
          await new Promise<void>((resolve, reject) => {
            const onLoadedMetadata = () => {
              audio.removeEventListener("loadedmetadata", onLoadedMetadata);
              audio.removeEventListener("error", onError);
              resolve();
            };
            const onError = () => {
              audio.removeEventListener("loadedmetadata", onLoadedMetadata);
              audio.removeEventListener("error", onError);
              reject(new Error("Failed to load audio"));
            };
            audio.addEventListener("loadedmetadata", onLoadedMetadata, { once: true });
            audio.addEventListener("error", onError, { once: true });
            // Timeout après 10s
            setTimeout(() => reject(new Error("Audio load timeout")), 10000);
          });
        }

        // Jouer l'audio
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
        }
        animRef.current = requestAnimationFrame(updateProgress);
        setPlaying(true);
      }
    } catch (err: any) {
      console.error("Audio play error:", err.message);
      toast.error("Impossible de lire l'audio : " + (err.message || "Erreur inconnue"));
      setPlaying(false);
    }
  };

  const toggleLike = async () => {
    if (!user || !postId) { toast.error("Sign in to like"); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);
    if (newLiked) await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: postId });
    else await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", postId);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-foreground font-bold">Post not found</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm mt-2">Go back</button>
      </div>
    );
  }

  const initials = (author?.display_name || "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div
      className="w-full h-full relative overflow-y-auto overflow-x-hidden"
      style={{ touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom, 56px)" }}
    >
      {/* Élément audio natif avec configuration CORS */}
      <audio
        ref={audioRef}
        onEnded={() => { 
          setPlaying(false); 
          setProgress(0); 
          cancelAnimationFrame(animRef.current); 
        }}
        onError={(e) => {
          console.error("Audio error:", e);
          toast.error("Erreur de lecture audio");
          setPlaying(false);
        }}
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
      />

      {/* Background */}
      {author?.avatar_url && (
        <div className="absolute inset-0 z-0">
          <img src={author.avatar_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/90" />
        </div>
      )}

      <div className="relative z-10 px-4 pt-3 pb-6">
        {/* Header */}
        <header className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full bg-card/60 backdrop-blur-sm flex items-center justify-center text-foreground">
            <ArrowLeft size={20} />
          </button>
        </header>

        {/* Author */}
        <button onClick={() => navigate(`/user/${post.user_id}`)} className="flex items-center gap-3 mb-6">
          {author?.avatar_url ? (
            <img src={author.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-primary/30" />
          ) : (
            <div className="w-12 h-12 rounded-full gradient-red flex items-center justify-center text-sm font-bold text-primary-foreground border-2 border-primary/30">
              {initials}
            </div>
          )}
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">{author?.display_name || "User"}</p>
            <p className="text-xs text-muted-foreground">{author?.username ? `@${author.username}` : ""} · {formatTime(post.created_at)}</p>
          </div>
        </button>

        {/* Title */}
        <h1 className="text-xl font-bold font-display text-foreground mb-6">{post.title}</h1>

        {/* Player */}
        <motion.div
          className="bg-card/60 backdrop-blur-md rounded-2xl p-5 border border-border/30 shadow-elevated cursor-pointer mb-6"
          whileTap={{ scale: 0.98 }}
          onClick={togglePlay}
        >
          <div className="w-full h-1 bg-secondary rounded-full mb-4 overflow-hidden">
            <div className="h-full gradient-red rounded-full transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="h-16 flex items-center justify-center">
            <WaveformVisualizer bars={waveform} isPlaying={playing} size="lg" color="coral" />
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="w-11 h-11 rounded-full gradient-red flex items-center justify-center shadow-red">
              {playing ? <Pause size={18} className="text-primary-foreground" /> : <Play size={18} className="text-primary-foreground ml-0.5" />}
            </div>
            <span className="text-xs text-muted-foreground font-medium">{formatDuration(post.duration)}</span>
          </div>
        </motion.div>

        {/* Actions */}
        <div className="flex items-center justify-around bg-card/60 backdrop-blur-md rounded-2xl p-4 border border-border/30">
          <button onClick={toggleLike} className="flex flex-col items-center gap-1">
            <motion.div whileTap={{ scale: 1.3 }}>
              <Heart size={24} className={liked ? "fill-primary text-primary" : "text-foreground"} />
            </motion.div>
            <span className={`text-xs font-medium ${liked ? "text-primary" : "text-muted-foreground"}`}>{formatCount(likeCount)}</span>
          </button>

          <button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1">
            <MessageCircle size={24} className="text-foreground" />
            <span className="text-xs text-muted-foreground font-medium">{formatCount(post.comments_count)}</span>
          </button>

          <button onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-1">
            <Share2 size={24} className="text-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Share</span>
          </button>
        </div>
      </div>

      {/* Spacer pour la navbar */}
      <div className="h-24" />

      <CommentsPanel open={commentsOpen} onClose={() => setCommentsOpen(false)} postId={post.id} />
      <SharePanel open={shareOpen} onClose={() => setShareOpen(false)} postId={post.id} postTitle={post.title} postAuthor={author?.display_name || "User"} />
    </div>
  );
};

export default PostPage;
