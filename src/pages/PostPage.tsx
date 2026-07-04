import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, Share2, Play, Pause, Gauge, MapPin, SkipBack, SkipForward } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { playExclusive, releaseAudio } from "@/lib/audioManager";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import CommentsPanel from "@/components/CommentsPanel";
import SharePanel from "@/components/SharePanel";
import LikesListModal from "@/components/LikesListModal";

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
  const [commentCount, setCommentCount] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animRef = useRef<number>(0);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const isSeekingRef = useRef(false);
  const waveform = useRef(generateWaveform()).current;

  useEffect(() => {
    if (!postId) return;
    const load = async () => {
      setLoading(true);
      const { data: p } = await supabase
        .from("voice_posts")
        .select("*, transcription, image_url, location")
        .eq("id", postId)
        .single();
      if (!p) {
        setLoading(false);
        return;
      }
      setPost(p);

      const [{ data: profile }, likesRes, commentsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", p.user_id).single(),
        supabase.from("voice_post_likes").select("id", { count: "exact", head: true }).eq("post_id", postId),
        supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
      ]);
      setAuthor(profile);
      setLikeCount(likesRes.count ?? p.likes_count ?? 0);
      setCommentCount(commentsRes.count ?? p.comments_count ?? 0);

      if (user) {
        const { data: like } = await supabase
          .from("voice_post_likes")
          .select("id")
          .eq("user_id", user.id)
          .eq("post_id", postId)
          .maybeSingle();
        setLiked(!!like);
      }
      setLoading(false);
    };
    load();
  }, [postId, user?.id]);

  useEffect(() => {
    if ((commentsOpen || shareOpen || likesOpen) && audioRef.current && playing) {
      audioRef.current.pause();
      releaseAudio(audioRef.current);
      cancelAnimationFrame(animRef.current);
      setPlaying(false);
    }
  }, [commentsOpen, shareOpen, likesOpen, playing]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        releaseAudio(audioRef.current);
        cancelAnimationFrame(animRef.current);
      }
    };
  }, []);

  const updateProgress = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime / (audioRef.current.duration || 1));
      if (!audioRef.current.paused) {
        animRef.current = requestAnimationFrame(updateProgress);
      }
    }
  };

  const cycleSpeed = () => {
    setSpeed((prev) => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  };

  const togglePlay = async () => {
    if (!post) return;
    if (!audioRef.current) {
      const a = new Audio();
      a.crossOrigin = "anonymous";
      a.preload = "auto";
      a.src = post.audio_url;
      a.load();
      a.onended = () => {
        setPlaying(false);
        setProgress(0);
        releaseAudio(a);
        cancelAnimationFrame(animRef.current);
      };
      a.onpause = () => setPlaying(false);
      a.onplay = () => setPlaying(true);
      audioRef.current = a;
    }
    const audio = audioRef.current;
    audio.playbackRate = speed;

    if (playing) {
      audio.pause();
      releaseAudio(audio);
      cancelAnimationFrame(animRef.current);
    } else {
      try {
        await playExclusive(audio);
        animRef.current = requestAnimationFrame(updateProgress);
      } catch {
        toast.error("Impossible de lire l'audio");
      }
    }
  };

  const seekToClientX = (clientX: number) => {
    const bar = seekBarRef.current;
    const audio = audioRef.current;
    if (!bar || !audio) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const dur = audio.duration || post?.duration || 1;
    audio.currentTime = ratio * dur;
    setProgress(ratio);
  };
  const handleSeekDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    isSeekingRef.current = true;
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    seekToClientX(e.clientX);
  };
  const handleSeekMove = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    e.stopPropagation();
    seekToClientX(e.clientX);
  };
  const handleSeekUp = (e: React.PointerEvent) => {
    if (!isSeekingRef.current) return;
    e.stopPropagation();
    isSeekingRef.current = false;
  };
  const jumpToStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setProgress(0);
    }
  };
  const jumpToEnd = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, (a.duration || post?.duration || 0) - 0.3);
    setProgress(1);
  };

  const toggleLike = async () => {
    if (!user || !postId) {
      toast.error("Sign in to like");
      return;
    }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => (newLiked ? c + 1 : c - 1));
    try {
      if (newLiked) {
        await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: postId });
      } else {
        await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", postId);
      }
      const { count } = await supabase
        .from("voice_post_likes")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (count !== null) setLikeCount(count);
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => (newLiked ? c - 1 : c + 1));
    }
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
        <button onClick={() => navigate(-1)} className="text-primary text-sm mt-2">
          Go back
        </button>
      </div>
    );
  }

  const initials = (author?.display_name || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const backgroundUrl = post.image_url || author?.avatar_url;

  return (
    <div
      className="w-full h-full relative overflow-y-auto overflow-x-hidden"
      style={{ touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom, 56px)" }}
    >
      {backgroundUrl && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img src={backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background/95" />
        </div>
      )}

      <div
        className="relative z-10 px-4 pb-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full bg-card/60 backdrop-blur-sm flex items-center justify-center text-foreground"
          >
            <ArrowLeft size={20} />
          </button>
        </header>

        <button
          onClick={() => navigate(`/user/${post.user_id}`)}
          className="flex items-center gap-3 mb-4"
        >
          {author?.avatar_url ? (
            <img
              src={author.avatar_url}
              alt=""
              className="w-12 h-12 rounded-full object-cover border-2 border-primary/30"
            />
          ) : (
            <div className="w-12 h-12 rounded-full gradient-red flex items-center justify-center text-sm font-bold text-primary-foreground border-2 border-primary/30">
              {initials}
            </div>
          )}
          <div className="text-left">
            <p className="text-sm font-bold text-foreground">{author?.display_name || "User"}</p>
            <p className="text-xs text-muted-foreground">
              {author?.username ? `@${author.username}` : ""} · {formatTime(post.created_at)}
            </p>
          </div>
        </button>

        {post.location && (
          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-card/50 backdrop-blur-sm border border-border/20 mb-3">
            <MapPin size={11} className="text-primary" />
            <span className="text-[11px] text-foreground/80 font-medium">{post.location}</span>
          </div>
        )}

        <h1 className="text-xl font-bold font-display text-foreground mb-5">{post.title}</h1>

        <motion.div
          className="bg-card/70 backdrop-blur-md rounded-2xl p-5 border border-border/30 shadow-elevated mb-4"
          whileTap={{ scale: 0.99 }}
        >
          <div
            ref={seekBarRef}
            onPointerDown={handleSeekDown}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekUp}
            className="relative w-full py-2 cursor-pointer touch-none"
          >
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full gradient-red rounded-full"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background shadow-md pointer-events-none"
              style={{ left: `calc(${progress * 100}% - 7px)` }}
            />
          </div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
              {formatDuration(Math.round(progress * post.duration))}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
              {formatDuration(post.duration)}
            </span>
          </div>
          <div className="h-14 flex items-center justify-center cursor-pointer" onClick={togglePlay}>
            <WaveformVisualizer bars={waveform} isPlaying={playing} size="lg" color="coral" />
          </div>
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={jumpToStart}
              className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <SkipBack size={15} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="w-12 h-12 rounded-full gradient-red flex items-center justify-center shadow-red"
            >
              {playing ? (
                <Pause size={20} className="text-primary-foreground" />
              ) : (
                <Play size={20} className="text-primary-foreground ml-0.5" />
              )}
            </button>
            <button
              onClick={jumpToEnd}
              className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <SkipForward size={15} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                cycleSpeed();
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full border transition-colors ${
                speed > 1
                  ? "bg-primary/20 border-primary/50 text-primary"
                  : "bg-secondary border-border/30 text-muted-foreground"
              }`}
            >
              <Gauge size={13} />
              <span className="text-xs font-bold">{speed}x</span>
            </button>
          </div>
        </motion.div>

        {post.transcription && (
          <div className="bg-card/50 backdrop-blur-sm rounded-xl px-4 py-3 border border-border/20 mb-4">
            <p className="text-xs text-foreground/80 leading-relaxed italic">
              "{post.transcription}"
            </p>
          </div>
        )}

        <div className="flex items-center justify-around bg-card/70 backdrop-blur-md rounded-2xl p-4 border border-border/30">
          <div className="flex flex-col items-center gap-1">
            <button onClick={toggleLike} aria-label="Like">
              <motion.div whileTap={{ scale: 1.3 }}>
                <Heart
                  size={24}
                  className={liked ? "fill-primary text-primary" : "text-foreground"}
                />
              </motion.div>
            </button>
            <button
              onClick={() => setLikesOpen(true)}
              className={`text-xs font-medium underline-offset-2 hover:underline ${
                liked ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {formatCount(likeCount)}
            </button>
          </div>

          <button
            onClick={() => setCommentsOpen(true)}
            className="flex flex-col items-center gap-1"
          >
            <MessageCircle size={24} className="text-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              {formatCount(commentCount)}
            </span>
          </button>

          <button onClick={() => setShareOpen(true)} className="flex flex-col items-center gap-1">
            <Share2 size={24} className="text-foreground" />
            <span className="text-xs text-muted-foreground font-medium">Share</span>
          </button>
        </div>
      </div>

      <div className="h-24" />

      <CommentsPanel
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        onCommentAdded={() => setCommentCount((c) => c + 1)}
      />
      <SharePanel
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        postId={post.id}
        postTitle={post.title}
        postAuthor={author?.display_name || "User"}
      />
      <LikesListModal open={likesOpen} onClose={() => setLikesOpen(false)} postId={post.id} />
    </div>
  );
};

export default PostPage;
