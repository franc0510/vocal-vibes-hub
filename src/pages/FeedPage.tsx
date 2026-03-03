import VoiceCard from "@/components/VoiceCard";
import { mockPosts } from "@/lib/mockData";
import { Heart } from "lucide-react";

const FeedPage = () => {
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1" />
          <h1 className="text-2xl font-bold font-display text-gradient-red">VocMe</h1>
          <div className="flex-1 flex justify-end">
            <button className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors relative shadow-card">
              <Heart size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 space-y-4 mt-3">
        {mockPosts.map((post, i) => (
          <VoiceCard key={post.id} post={post} index={i} />
        ))}
      </main>
    </div>
  );
};

export default FeedPage;
