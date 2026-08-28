import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, LogOut, Camera, Loader2 } from "lucide-react";
import PostTile from "@/components/PostTile";
import { useAuth } from "@/contexts/AuthContext";
import { type VoicePostWithAuthor } from "@/hooks/useVoicePosts";
import { parseSegments } from "@/lib/captions";
import { useFollows } from "@/hooks/useFollows";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FollowListModal from "@/components/FollowListModal";

const ProfilePage = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [userPosts, setUserPosts] = useState<VoicePostWithAuthor[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [followListType, setFollowListType] = useState<"followers" | "following" | null>(null);
  const { followersCount, followingCount } = useFollows(user?.id);

  // Fetch ALL of the current user's posts directly (independent of the paginated feed)
  useEffect(() => {
    if (!user) return;
    const fetchOwnPosts = async () => {
      const { data: rawPosts } = await supabase
        .from("voice_posts")
        .select("*, transcription, image_url, location")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!rawPosts) return;

      const postIds = rawPosts.map((p) => p.id);
      const [{ data: allLikes }, { data: allComments }, { data: myLikes }] = await Promise.all([
        supabase.from("voice_post_likes").select("post_id").in("post_id", postIds),
        supabase.from("comments").select("post_id").in("post_id", postIds),
        supabase.from("voice_post_likes").select("post_id").eq("user_id", user.id),
      ]);

      const likeMap = new Map<string, number>();
      for (const l of allLikes || []) likeMap.set(l.post_id, (likeMap.get(l.post_id) || 0) + 1);
      const commentMap = new Map<string, number>();
      for (const c of allComments || []) commentMap.set(c.post_id, (commentMap.get(c.post_id) || 0) + 1);
      const likedSet = new Set((myLikes || []).map((l) => l.post_id));

      const initials = (profile?.display_name || "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

      const enriched: VoicePostWithAuthor[] = rawPosts.map((p) => ({
        ...p,
        likes_count: likeMap.get(p.id) ?? p.likes_count ?? 0,
        comments_count: commentMap.get(p.id) ?? p.comments_count ?? 0,
        transcription: p.transcription || null,
        transcription_segments: parseSegments(p.transcription_segments),
        image_url: p.image_url || null,
        location: p.location || null,
        author: {
          name: profile?.display_name || "Me",
          username: profile?.username ? `@${profile.username}` : "@me",
          avatar: initials,
          avatarUrl: profile?.avatar_url || undefined,
        },
        isLiked: likedSet.has(p.id),
      }));

      setUserPosts(enriched);
    };
    fetchOwnPosts();
  }, [user?.id, profile?.display_name, profile?.avatar_url, profile?.username]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      // Add cache buster to force refresh
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: urlWithCacheBust } as any).eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast.success("Profile picture updated!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      // Reset file input so same file can be selected again
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const initials = profile?.display_name
    ? profile.display_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "ME";

  return (
    <div className="min-h-screen pb-24 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}>
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold font-display text-foreground">
          @{profile?.username || user?.email?.split("@")[0] || "myprofile"}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={signOut} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
            <LogOut size={16} />
          </button>
          <button onClick={() => navigate("/settings")} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <div className="flex items-center gap-5 mb-4">
        <div className="relative group">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-primary" />
          ) : (
            <div className="w-20 h-20 rounded-full gradient-coral flex items-center justify-center text-xl font-bold text-primary-foreground font-display border-2 border-primary">
              {initials}
            </div>
          )}
          <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading ? <Loader2 size={18} className="text-foreground animate-spin" /> : <Camera size={18} className="text-foreground" />}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
        </div>
        <div className="flex flex-1 justify-around">
          <div className="text-center">
            <p className="text-lg font-bold font-display text-foreground">{userPosts.length}</p>
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
        <p className="text-sm font-bold text-foreground">{profile?.display_name || "My Profile"}</p>
        {profile?.username && (
          <p className="text-xs text-muted-foreground mt-0.5">@{profile.username}</p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">{profile?.bio || "Voice enthusiast 🎤"}</p>
      </div>

      {userPosts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground text-sm">No stories yet. Record your first one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {userPosts.map((post) => (
            <PostTile
              key={post.id}
              post={post}
              avatarUrl={profile?.avatar_url}
              initials={initials}
              onSelect={() => navigate(`/user/${user!.id}/vocme/${post.id}`)}
            />
          ))}
        </div>
      )}

      {user && (
        <FollowListModal
          open={followListType !== null}
          onClose={() => setFollowListType(null)}
          userId={user.id}
          type={followListType || "followers"}
        />
      )}
    </div>
  );
};

export default ProfilePage;
