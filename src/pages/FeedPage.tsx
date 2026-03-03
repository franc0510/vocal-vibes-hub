import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Bell } from "lucide-react";
import VoiceCard from "@/components/VoiceCard";
import { mockPosts, CATEGORIES, type VoicePost } from "@/lib/mockData";

const FeedPage = () => {
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = activeCategory === "all" ? mockPosts : mockPosts.filter((p) => p.category === activeCategory);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold font-display text-gradient-coral">Vocalo</h1>
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
              <Search size={18} />
            </button>
            <button className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative">
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`relative px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.id
                  ? "text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {activeCategory === cat.id && (
                <motion.div
                  layoutId="activeCat"
                  className="absolute inset-0 gradient-coral rounded-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative z-10">{cat.icon} {cat.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Feed */}
      <main className="px-4 space-y-4 mt-2">
        {filtered.map((post, i) => (
          <VoiceCard key={post.id} post={post} index={i} />
        ))}
      </main>
    </div>
  );
};

export default FeedPage;
