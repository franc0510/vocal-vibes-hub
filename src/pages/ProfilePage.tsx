import { motion } from "framer-motion";
import { Settings, Grid3X3, Heart, Headphones } from "lucide-react";
import VoiceCard from "@/components/VoiceCard";
import { mockPosts } from "@/lib/mockData";

const ProfilePage = () => {
  const userPosts = mockPosts.slice(0, 3);

  return (
    <div className="min-h-screen pb-24 px-4 pt-4">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display text-gradient-coral">Profil</h1>
        <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <Settings size={18} />
        </button>
      </header>

      {/* Profile card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl p-6 shadow-card mb-6"
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full gradient-coral flex items-center justify-center text-xl font-bold text-primary-foreground font-display">
            ME
          </div>
          <div>
            <h2 className="text-lg font-bold font-display text-foreground">Mon Profil</h2>
            <p className="text-sm text-muted-foreground">@monprofil</p>
          </div>
        </div>

        <p className="text-sm text-secondary-foreground mb-4">
          Passionné de vocaux 🎤 Je partage ma vie en audio ✨
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

      {/* Tabs */}
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

      {/* Posts */}
      <div className="space-y-4">
        {userPosts.map((post, i) => (
          <VoiceCard key={post.id} post={post} index={i} />
        ))}
      </div>
    </div>
  );
};

export default ProfilePage;
