import { useState } from "react";
import { Heart } from "lucide-react";
import NotificationsPanel from "@/components/NotificationsPanel";
import RealsViewer from "@/components/RealsViewer";

const FeedPage = () => {
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col">
      <header className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex-1" />
        <h1 className="text-xl font-bold font-display text-gradient-red">VocMe</h1>
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

      <RealsViewer />
    </div>
  );
};

export default FeedPage;
