import { useState } from "react";
import { Heart } from "lucide-react";
import VoiceCard from "@/components/VoiceCard";
import NotificationsPanel from "@/components/NotificationsPanel";
import { useVoicePosts } from "@/hooks/useVoicePosts";

const FeedPage = () => {
  const [notifOpen, setNotifOpen] = useState(false);
  const { posts, loading } = useVoicePosts();

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          <h1 className="text-2xl font-bold font-display text-gradient-red">VocMe</h1>
          <div className="flex-1 flex justify-end">
            <button
              onClick={() => setNotifOpen(true)}
              className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors relative shadow-card"
            >
              <Heart size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </div>
      </header>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <main className="px-4 space-y-4 mt-3">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-lg font-display font-bold text-foreground mb-1">No stories yet</p>
            <p className="text-sm text-muted-foreground">Be the first to share a voice story!</p>
          </div>
        ) : (
          posts.map((post, i) => (
            <VoiceCard key={post.id} post={post} index={i} />
          ))
        )}
      </main>
    </div>
  );
};

export default FeedPage;
