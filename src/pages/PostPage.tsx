import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Heart, MessageCircle, Share2, Play, Pause, MapPin, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { playExclusive, releaseAudio } from "@/lib/audioManager";
import CommentsPanel from "@/components/CommentsPanel";
import SharePanel from "@/components/SharePanel";
import LikesListModal from "@/components/LikesListModal";
import StorySlideshow from "@/components/StorySlideshow";
import { useIllustrations } from "@/hooks/useIllustrations";
import { parseSegments } from "@/lib/captions";

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

  const { panels, status: illustrationStatus, requesting, illustrate } = useIllustrations(
    postId,
    post?.illustration_status
  );

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

  const isOwner = user?.id === post.user_id;
  // Same test as the feed: an anecdote whose MP4 exists is watchable even
  // before its panel rows are loaded, so video_url counts on its own.
  const hasSlideshow = panels.length > 0 || Boolean(post.video_url);
  // duration_ms is the measured length; `duration` is a whole-second counter
  // and always a little short, which slid every panel out of step with the
  // voice — the same shortfall that used to cut the closing words.
  const currentMs = progress * (post.duration_ms ?? (post.duration || 0) * 1000);

  const handleIllustrate = async () => {
    try {
      await illustrate({
        audioUrl: post.audio_url,
        hasTranscription: Boolean(post.transcription?.trim()),
      });
      toast.success("On dessine ton anecdote… ça prend une minute ✨");
    } catch (err: any) {
      toast.error(err?.message || "Impossible d'illustrer cette anecdote");
    }
  };

  return (
    <div
      className="w-full h-full relative overflow-y-auto overflow-x-hidden"
      style={{ touchAction: "pan-y", paddingBottom: "env(safe-area-inset-bottom, 56px)" }}
    >
      {hasSlideshow ? (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <StorySlideshow
            panels={panels}
            currentMs={currentMs}
            videoUrl={post.video_url}
            isPlaying={playing}
            segments={parseSegments(post.transcription_segments)}
            overlay={
              <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/30 to-background/95" />
            }
          />
        </div>
      ) : backgroundUrl ? (
        <div className="fixed inset-0 z-0 pointer-events-none">
          <img src={backgroundUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/30 to-background/95" />
        </div>
      ) : null}

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

        {/*
          One short row instead of a card, and the same gauge as the feed so the
          two screens feel like one app: the illustration is the point, and a
          panel of controls in front of it is what hides it.
        */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label={playing ? "Pause" : "Lecture"}
            className="w-8 h-8 shrink-0 rounded-full gradient-red flex items-center justify-center shadow-red"
          >
            {playing ? (
              <Pause size={14} className="text-primary-foreground" />
            ) : (
              <Play size={14} className="text-primary-foreground ml-0.5" />
            )}
          </button>

          {/* Thin bar, thumb-sized target. */}
          <div
            ref={seekBarRef}
            onPointerDown={handleSeekDown}
            onPointerMove={handleSeekMove}
            onPointerUp={handleSeekUp}
            className="relative flex-1 py-2.5 cursor-pointer touch-none"
          >
            <div className="w-full h-[3px] bg-foreground/25 rounded-full overflow-hidden">
              <div
                className="h-full gradient-red rounded-full"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary border border-background shadow pointer-events-none"
              style={{ left: `calc(${progress * 100}% - 5px)` }}
            />
          </div>

          <span className="text-[10px] text-muted-foreground font-medium tabular-nums shrink-0">
            {formatDuration(Math.round(progress * post.duration))} / {formatDuration(post.duration)}
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              cycleSpeed();
            }}
            className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md border transition-colors ${
              speed > 1
                ? "bg-primary/20 border-primary/50 text-primary"
                : "bg-card/60 backdrop-blur-sm border-border/30 text-muted-foreground"
            }`}
          >
            {speed}x
          </button>
        </div>

        {/* Hidden under a slideshow: the captions already say this, in step. */}
        {post.transcription && !hasSlideshow && (
          <div className="bg-card/50 backdrop-blur-sm rounded-xl px-4 py-3 border border-border/20 mb-4">
            <p className="text-xs text-foreground/80 leading-relaxed italic">
              "{post.transcription}"
            </p>
          </div>
        )}

        {isOwner && !hasSlideshow && (
          <div className="mb-4">
            {illustrationStatus === "pending" ? (
              <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-card/50 backdrop-blur-sm border border-border/20">
                <Loader2 size={15} className="text-primary animate-spin" />
                <span className="text-xs text-muted-foreground font-medium">
                  On dessine ton anecdote…
                </span>
              </div>
            ) : (
              <button
                onClick={handleIllustrate}
                disabled={requesting}
                className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-card/70 backdrop-blur-md border border-border/30 text-foreground font-medium text-sm disabled:opacity-60 transition-opacity"
              >
                {requesting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} className="text-primary" />
                )}
                {illustrationStatus === "failed" ? "Réessayer d'illustrer" : "Illustrer mon anecdote"}
              </button>
            )}
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
