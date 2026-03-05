import { useState } from "react";
import { Heart } from "lucide-react";
import NotificationsPanel from "@/components/NotificationsPanel";
import RealsViewer from "@/components/RealsViewer";
import { useFollows } from "@/hooks/useFollows";

const FeedPage = () => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "friends">("all");
  const { followingIds } = useFollows();

  return (
    <div className="h-screen flex flex-col">
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-card/60 backdrop-blur-md rounded-full p-1 border border-border/30">
          <button
            onClick={() => setTab("all")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              tab === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            For you
          </button>
          <button
            onClick={() => setTab("friends")}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              tab === "friends"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Friends
          </button>
        </div>
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => setNotifOpen(true)}
            className="w-10 h-10 rounded-xl bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors relative shadow-card"
          >
            <Heart size={18} />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
          </button>
        </div>
      </header>

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <RealsViewer
        key={tab}
        filterFriends={tab === "friends"}
        friendIds={followingIds}
      />
    </div>
  );
};

export default FeedPage;
