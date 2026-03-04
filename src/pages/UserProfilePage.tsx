import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Pause, MessageCircle, X, UserPlus, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFollows } from "@/hooks/useFollows";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import FollowListModal from "@/components/FollowListModal";

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
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveform = useRef(generateWaveform()).current;

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(post.audio_url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
    setPlaying(!playing);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
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
          <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
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
        <p className="text-xs text-muted-foreground mt-3 text-center">{formatDuration(post.duration)} · ❤️ {post.likes_count}</p>
      </motion.div>
    </motion.div>
  );
};

const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [followListType, setFollowListType] = useState<"followers" | "following" | null>(null);

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
    <div className="min-h-screen pb-24 px-4 pt-4">
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
    </div>
  );
};

export default UserProfilePage;
