import { useState } from "react";
import { Heart, Users, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import NotificationsPanel from "@/components/NotificationsPanel";
import RealsViewer from "@/components/RealsViewer";
import { useFollows } from "@/hooks/useFollows";
import { useGroups } from "@/hooks/useGroups";

const FeedPage = () => {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "friends" | "group">("all");
  // "all" = all groups, or a specific group id
  const [selectedGroupId, setSelectedGroupId] = useState<string>("all");
  const { followingIds } = useFollows();
  const { groups } = useGroups();

  return (
    <div className="h-full w-full flex flex-col relative">
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pb-2" style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)' }}>
        <div className="flex-1 flex justify-start">
          <button
            onClick={() => navigate("/groups")}
            className="w-10 h-10 rounded-xl bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shadow-card"
          >
            <Users size={18} />
          </button>
        </div>
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
          {groups.length > 0 && (
            <button
              onClick={() => setTab("group")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                tab === "group"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Group
            </button>
          )}
        </div>
        <div className="flex-1 flex justify-end">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/messages")}
              className="w-10 h-10 rounded-xl bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors shadow-card"
              aria-label="Messages"
            >
              <MessageCircle size={18} />
            </button>
            <button
              onClick={() => setNotifOpen(true)}
              className="w-10 h-10 rounded-xl bg-card/80 backdrop-blur border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors relative shadow-card"
              aria-label="Notifications"
            >
              <Heart size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
            </button>
          </div>
        </div>
      </header>

      {/* Group filter dropdown — "All groups" + individual groups */}
      {tab === "group" && (
        <div className="absolute top-0 left-0 right-0 z-20 flex justify-center" style={{ paddingTop: 'calc(max(env(safe-area-inset-top), 16px) + 48px)' }}>
          <select
            value={selectedGroupId}
            onChange={(e) => setSelectedGroupId(e.target.value)}
            className="bg-card/80 backdrop-blur-md border border-border/30 rounded-full px-4 py-1.5 text-xs font-bold text-foreground outline-none"
          >
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      )}

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />

      <RealsViewer
        key={`${tab}-${selectedGroupId}`}
        filterFriends={tab === "friends"}
        friendIds={followingIds}
        filterGroupId={tab === "group" && selectedGroupId !== "all" ? selectedGroupId : undefined}
        filterAllGroups={tab === "group" && selectedGroupId === "all"}
      />
    </div>
  );
};

export default FeedPage;
