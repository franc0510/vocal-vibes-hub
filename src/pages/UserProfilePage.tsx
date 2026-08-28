import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, MessageCircle, X, UserPlus, UserCheck, Flag, Ban, MoreVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PostTile from "@/components/PostTile";
import { useFollows } from "@/hooks/useFollows";
import FollowListModal from "@/components/FollowListModal";
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
  illustration_cover_url?: string | null;
  image_url?: string | null;
}


const UserProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
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

      // Arriving from a notification: go straight to that anecdote, full
      // screen, rather than opening a card the reader then has to leave.
      const postIdParam = searchParams.get("postId");
      if (postIdParam && (postsRes.data as Post[] | null)?.some((p) => p.id === postIdParam)) {
        navigate(`/user/${userId}/vocme/${postIdParam}`, { replace: true });
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
            <PostTile
              key={post.id}
              post={post}
              avatarUrl={profile.avatar_url}
              initials={initials}
              onSelect={() => navigate(`/user/${userId}/vocme/${post.id}`)}
            />
          ))}
        </div>
      )}

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
