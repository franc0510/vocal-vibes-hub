import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Bell } from "lucide-react";
import VoiceCard from "@/components/VoiceCard";
import { mockPosts } from "@/lib/mockData";

const FeedPage = () => {
  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold font-display text-gradient-red">VocMe</h1>
            <p className="text-xs text-muted-foreground">Les meilleures anecdotes du jour 🎤</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-card">
              <Search size={18} />
            </button>
            <button className="w-10 h-10 rounded-xl bg-card border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative shadow-card">
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </div>

        {/* Daily prompt banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-red-soft rounded-xl p-3 border border-primary/10"
        >
          <p className="text-sm font-medium text-foreground">
            🔔 <span className="font-display font-bold">Anecdote du jour</span> — Raconte ton moment le plus gênant aujourd'hui !
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">45 secondes max · Rappel à 18h</p>
        </motion.div>
      </header>

      {/* Feed */}
      <main className="px-4 space-y-4 mt-3">
        {mockPosts.map((post, i) => (
          <VoiceCard key={post.id} post={post} index={i} />
        ))}
      </main>
    </div>
  );
};

export default FeedPage;
