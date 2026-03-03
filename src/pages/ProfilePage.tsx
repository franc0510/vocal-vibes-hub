import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut, Camera, Loader2, X, Play } from "lucide-react";
import WaveformVisualizer from "@/components/WaveformVisualizer";
import { mockPosts, type VoicePost } from "@/lib/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ProfilePage = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const userPosts = mockPosts;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<VoicePost | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: publicUrl } as any).eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast.success("Photo de profil mise à jour !");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const initials = profile?.display_name
    ? profile.display_name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)
    : "ME";

  return (
    <div className="min-h-screen pb-24 px-4 pt-4">
      {/* Header */}
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold font-display text-foreground">
          @{profile?.username || user?.email?.split("@")[0] || "monprofil"}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={signOut} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
            <LogOut size={16} />
          </button>
          <button className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Profile info row */}
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
            <p className="text-xs text-muted-foreground">Vocaux</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-display text-foreground">1.2k</p>
            <p className="text-xs text-muted-foreground">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold font-display text-foreground">389</p>
            <p className="text-xs text-muted-foreground">Following</p>
          </div>
        </div>
      </div>

      {/* Name & bio */}
      <div className="mb-4">
        <p className="text-sm font-bold text-foreground">{profile?.display_name || "Mon Profil"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{profile?.bio || "Passionné de vocaux 🎤"}</p>
      </div>

      {/* Posts grid */}
      <div className="grid grid-cols-3 gap-1">
        {userPosts.map((post) => (
          <button
            key={post.id}
            onClick={() => { setSelectedPost(post); setIsPlaying(false); }}
            className="aspect-square bg-card border border-border/30 rounded-md flex flex-col items-center justify-center p-2 hover:bg-primary/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full gradient-red flex items-center justify-center mb-1">
              <Play size={14} className="text-primary-foreground ml-0.5" />
            </div>
            <p className="text-[10px] text-foreground font-medium text-center line-clamp-2 leading-tight">{post.title}</p>
          </button>
        ))}
      </div>

      {/* Zoom modal */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-card rounded-2xl p-6 w-full max-w-sm shadow-card border border-border/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-bold font-display text-foreground flex-1 pr-2">{selectedPost.title}</h3>
                <button onClick={() => setSelectedPost(null)} className="text-muted-foreground hover:text-foreground">
                  <X size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  className="w-24 h-24 rounded-full gradient-red flex items-center justify-center cursor-pointer shadow-red"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  <div className="w-20 h-20 rounded-full bg-card flex items-center justify-center">
                    {isPlaying ? (
                      <WaveformVisualizer bars={selectedPost.waveform.slice(0, 12)} isPlaying size="md" color="coral" />
                    ) : (
                      <Play size={28} className="text-primary ml-1" />
                    )}
                  </div>
                </motion.div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedPost.author.name}</span>
                  <span>·</span>
                  <span>{selectedPost.duration}s</span>
                  <span>·</span>
                  <span>{selectedPost.createdAt}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfilePage;
