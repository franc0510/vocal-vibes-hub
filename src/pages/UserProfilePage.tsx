import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Pause, MessageCircle, X, UserPlus, UserCheck, Heart, Share2, Flag, Ban, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playExclusive, releaseAudio } from "@/lib/audioManager";
import { useFollows } from "@/hooks/useFollows";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import FollowListModal from "@/components/FollowListModal";
import CommentsPanel from "@/components/CommentsPanel";
import SharePanel from "@/components/SharePanel";
import LikesListModal from "@/components/LikesListModal";
import { toast } from "sonner";

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
}

interface Post {
  id: string;
  title: string;
  audio_url: string;
  duration: number;
  created_at: string;
  likes_count: number;
  comments_count: number;
}

const generateWaveform = () => Array.from({ length: 24 }, () => 0.15 + Math.random() * 0.85);
const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

const PostTile = ({ post, onSelect }: { post: Post; onSelect: () => void }) => (
  <button
    onClick={onSelect}
    className="aspect-square bg-card border border-border/30 rounded-xl flex flex-col items-center justify-center p-2 hover:bg-primary/5 transition-colors"
  >
    <div className="w-8 h-8 rounded-full gradient-red flex items-center justify-center mb-1">
      <Play size={14} className="text-primary-foreground ml-0.5" />
    </div>
    <p className="text-[10px] text-foreground font-medium text-center line-clamp-2 leading-tight">{post.title}</p>
    <p className="text-[9px] text-muted-foreground mt-0.5">{formatDuration(post.duration)}</p>
  </button>
);

const PostPlayer = ({ post, onClose }: { post: Post; onClose: () => void }) => {
  const { user } = useAuth();
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes_count);
  const [commentCount, setCommentCount] = useState(post.comments_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveform = useRef(generateWaveform()).current;

  // Check if user already liked
  useEffect(() => {
    if (!user) return;
    supabase
      .from("voice_post_likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("post_id", post.id)
      .maybeSingle()
      .then(({ data }) => setLiked(!!data));
  }, [user?.id, post.id]);

  // Fetch actual counts
  useEffect(() => {
    Promise.all([
      supabase.from("voice_post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("post_id", post.id),
    ]).then(([likesRes, commentsRes]) => {
      if (likesRes.count !== null) setLikeCount(likesRes.count);
      if (commentsRes.count !== null) setCommentCount(commentsRes.count);
    });
  }, [post.id]);

  // Cleanup audio on unmount / close
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        releaseAudio(audioRef.current);
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      releaseAudio(audioRef.current);
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
    onClose();
  };

  // Pause when comments / share / likes panels open
  useEffect(() => {
    if ((commentsOpen || shareOpen || likesOpen) && audioRef.current && playing) {
      audioRef.current.pause();
      releaseAudio(audioRef.current);
      setPlaying(false);
    }
  }, [commentsOpen, shareOpen, likesOpen]);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audio_url);
      audioRef.current.crossOrigin = "anonymous";
      audioRef.current.onended = () => { setPlaying(false); releaseAudio(audioRef.current); };
      audioRef.current.onpause = () => setPlaying(false);
      audioRef.current.onplay = () => setPlaying(true);
    }
    if (playing) { audioRef.current.pause(); releaseAudio(audioRef.current); }
    else playExclusive(audioRef.current).catch(() => {});
  };

  const toggleLike = async () => {
    if (!user) return;
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);
    try {
      if (newLiked) await supabase.from("voice_post_likes").insert({ user_id: user.id, post_id: post.id });
      else await supabase.from("voice_post_likes").delete().eq("user_id", user.id).eq("post_id", post.id);
      const { count } = await supabase.from("voice_post_likes").select("id", { count: "exact", head: true }).eq("post_id", post.id);
      if (count !== null) setLikeCount(count);
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => newLiked ? c - 1 : c + 1);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => {
          // Don't close PostPlayer if a sub-panel is open
          if (commentsOpen || shareOpen || likesOpen) return;
          handleClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          className="w-full max-w-sm bg-card rounded-2xl p-5 border border-border/50 shadow-elevated"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-foreground font-display">{post.title}</h3>
            <button onClick={handleClose} className="text-muted-foreground"><X size={18} /></button>
          </div>
          <div
            className="flex items-center gap-3 bg-secondary/60 rounded-xl p-4 cursor-pointer"
            onClick={toggle}
          >
            <button className="w-11 h-11 rounded-full gradient-red flex items-center justify-center text-primary-foreground shrink-0 shadow-red">
              {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>
            <div className="flex-1 overflow-hidden h-10">
              <WaveformVisualizer bars={waveform} isPlaying={playing} size="md" />
            </div>
          </div>

          {/* Stats: like, comment, share */}
          <div className="flex items-center justify-around mt-4 pt-3 border-t border-border/30">
            <div className="flex items-center gap-2">
              <button onClick={toggleLike} className="flex items-center gap-1.5" aria-label="Like">
                <motion.div whileTap={{ scale: 1.3 }}>
                  <Heart size={20} className={liked ? "fill-primary text-primary" : "text-muted-foreground"} />
                </motion.div>
              </button>
              <button
                onClick={() => setLikesOpen(true)}
                className={`text-xs font-medium underline-offset-2 hover:underline ${liked ? "text-primary" : "text-muted-foreground"}`}
                aria-label="See who liked"
              >
                {likeCount}
              </button>
            </div>
            <button onClick={() => setCommentsOpen(true)} className="flex items-center gap-1.5" aria-label="Open comments">
              <MessageCircle size={20} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">{commentCount}</span>
            </button>
            <button onClick={() => setShareOpen(true)} className="flex items-center gap-1.5" aria-label="Share">
              <Share2 size={20} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Share</span>
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-3 text-center">{formatDuration(post.duration)}</p>
        </motion.div>
      </motion.div>

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
        postAuthor=""
      />
      <LikesListModal
        open={likesOpen}
        onClose={() => setLikesOpen(false)}
        postId={post.id}
      />
    </>
  );
};

const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [followListType, setFollowListType] = useState<"followers" | "following" | null>(null);
  const [reportBlockOpen, setReportBlockOpen] = useState(false);

  const { isFollowing, followersCount, followingCount, toggleFollow, loading: followLoading } = useFollows(userId);
  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoading(true);
      const [profileRes, postsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).single(),
        supabase.from("voice_posts").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);
      setProfile(profileRes.data as Profile | null);
      setPosts((postsRes.data as Post[]) || []);
      setLoading(false);

      // Auto-open a specific post if navigated from notification
      const postIdParam = searchParams.get("postId");
      if (postIdParam && postsRes.data) {
        const matchedPost = (postsRes.data as Post[]).find((p) => p.id === postIdParam);
        if (matchedPost) setSelectedPost(matchedPost);
      }
    };
    load();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-foreground font-bold">User not found</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm mt-2">Go back</button>
      </div>
    );
  }

  const initials = (profile.display_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen pb-24 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
      <header className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold font-display text-foreground">
          {profile.display_name || "User"}
        </h1>
      </header>

      <div className="flex items-center gap-5 mb-4">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-primary" />
        ) : (
          <div className="w-20 h-20 rounded-full gradient-red flex items-center justify-center text-xl font-bold text-primary-foreground font-display border-2 border-primary">
            {initials}
          </div>
        )}
        <div className="flex flex-1 justify-around">
          <div className="text-center">
            <p className="text-lg font-bold font-display text-foreground">{posts.length}</p>
            <p className="text-xs text-muted-foreground">Voices</p>
          </div>
          <button className="text-center" onClick={() => setFollowListType("followers")}>
            <p className="text-lg font-bold font-display text-foreground">{followersCount}</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </button>
          <button className="text-center" onClick={() => setFollowListType("following")}>
            <p className="text-lg font-bold font-display text-foreground">{followingCount}</p>
            <p className="text-xs text-muted-foreground">Following</p>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm font-bold text-foreground">{profile.display_name}</p>
        {profile.username && <p className="text-xs text-muted-foreground">@{profile.username}</p>}
        {profile.bio && <p className="text-xs text-muted-foreground mt-1">{profile.bio}</p>}
      </div>

      {!isOwnProfile && (
        <div className="flex gap-2 mb-5">
          <button
            onClick={toggleFollow}
            disabled={followLoading}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors ${
              isFollowing
                ? "bg-secondary text-foreground hover:bg-secondary/80"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {isFollowing ? <UserCheck size={16} /> : <UserPlus size={16} />}
            {isFollowing ? "Suivi" : "Suivre"}
          </button>
          <button
            onClick={() => navigate(`/messages?user=${userId}&name=${encodeURIComponent(profile.display_name || "User")}`)}
            className="flex-1 flex items-center justify-center gap-2 bg-secondary rounded-xl py-2.5 text-sm font-medium text-foreground hover:bg-secondary/80 transition-colors"
          >
            <MessageCircle size={16} />
            Message
          </button>
          <button
            onClick={() => setReportBlockOpen(true)}
            className="w-11 flex items-center justify-center bg-secondary rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Report or Block"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-12">No stories yet</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {posts.map((post) => (
            <PostTile key={post.id} post={post} onSelect={() => setSelectedPost(post)} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedPost && <PostPlayer post={selectedPost} onClose={() => setSelectedPost(null)} />}
      </AnimatePresence>

      {userId && (
        <FollowListModal
          open={followListType !== null}
          onClose={() => setFollowListType(null)}
          userId={userId}
          type={followListType || "followers"}
        />
      )}

      {/* Report / Block Modal */}
      {/* Report & Block Modal */}
      <AnimatePresence>
        {reportBlockOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md" 
              onClick={() => setReportBlockOpen(false)} 
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <div className="bg-card rounded-2xl w-full max-w-sm overflow-hidden border border-border/50 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/30 bg-secondary/30">
                  <h3 className="text-base font-bold text-foreground">Report or Block</h3>
                  <button 
                    onClick={() => setReportBlockOpen(false)} 
                    className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Report Section */}
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Flag size={16} className="text-red-500" />
                    <span className="text-sm font-semibold text-foreground">Report this user</span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    {["Harassment", "Hate speech", "Explicit", "Copyright", "Spam", "Other"].map((reason) => (
                      <button
                        key={reason}
                        onClick={async () => {
                          if (!currentUser || !userId) return;
                          try {
                            const { error } = await (supabase as any)
                              .from("user_reports")
                              .insert({ user_id: currentUser.id, reported_user_id: userId, reason, status: "pending" });
                            if (error && error.code === "23505") {
                              toast.info("Already reported");
                            } else if (error) {
                              throw error;
                            } else {
                              toast.success("Report submitted!");
                            }
                          } catch (err: any) {
                            toast.error(err.message || "Failed to report");
                          }
                          setReportBlockOpen(false);
                        }}
                        className="px-3 py-2.5 rounded-xl text-xs font-medium text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-all border border-red-500/20 hover:border-red-500/40"
                      >
                        {reason}
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  {/* Block Button */}
                  <button
                    onClick={async () => {
                      if (!currentUser || !userId) return;
                      try {
                        const { error } = await (supabase as any)
                          .from("blocks")
                          .insert({ user_id: currentUser.id, blocked_user_id: userId });
                        if (error && error.code !== "23505") throw error;
                        toast.success("User blocked! Their content is now hidden.");
                        setReportBlockOpen(false);
                        navigate(-1);
                      } catch (err: any) {
                        toast.error(err.message || "Failed to block user");
                      }
                    }}
                    className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Ban size={16} />
                    Block this user
                  </button>

                  {/* Cancel */}
                  <button
                    onClick={() => setReportBlockOpen(false)}
                    className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    Cancel
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

export default UserProfilePage;
