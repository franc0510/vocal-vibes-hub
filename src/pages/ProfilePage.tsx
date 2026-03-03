import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Settings, Grid3X3, Heart, Headphones, LogOut, Camera, Loader2 } from "lucide-react";
import VoiceCard from "@/components/VoiceCard";
import { mockPosts } from "@/lib/mockData";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ProfilePage = () => {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const userPosts = mockPosts.slice(0, 3);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl } as any)
        .eq("id", user.id);
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
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display text-gradient-red">Profil</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={signOut}
            className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
          >
            <LogOut size={18} />
          </button>
          <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <Settings size={18} />
          </button>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl p-6 shadow-card mb-6"
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="relative group">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full gradient-coral flex items-center justify-center text-xl font-bold text-primary-foreground font-display">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {uploading ? <Loader2 size={20} className="text-foreground animate-spin" /> : <Camera size={20} className="text-foreground" />}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-display text-foreground">
              {profile?.display_name || "Mon Profil"}
            </h2>
            <p className="text-sm text-muted-foreground">
              @{profile?.username || user?.email?.split("@")[0] || "monprofil"}
            </p>
          </div>
        </div>

        <p className="text-sm text-secondary-foreground mb-4">
          {profile?.bio || "Passionné de vocaux 🎤 Je partage ma vie en audio ✨"}
        </p>

        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-lg font-bold font-display text-foreground">42</p>
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
      </motion.div>

      <div className="flex gap-1 bg-secondary rounded-xl p-1 mb-4">
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg gradient-coral text-primary-foreground text-sm font-medium">
          <Grid3X3 size={16} /> Mes vocaux
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-muted-foreground text-sm font-medium hover:text-foreground transition-colors">
          <Heart size={16} /> Likés
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-muted-foreground text-sm font-medium hover:text-foreground transition-colors">
          <Headphones size={16} /> Écoutés
        </button>
      </div>

      <div className="space-y-4">
        {userPosts.map((post, i) => (
          <VoiceCard key={post.id} post={post} index={i} />
        ))}
      </div>
    </div>
  );
};

export default ProfilePage;
