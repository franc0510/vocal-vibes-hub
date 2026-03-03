import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, UserPlus, X } from "lucide-react";

interface Notification {
  id: string;
  type: "like" | "comment" | "share" | "follow";
  user: string;
  avatar: string;
  title?: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: "n1", type: "like", user: "Léa Martin", avatar: "LM", title: "Spilled coffee on my boss 😂", time: "2m ago", read: false },
  { id: "n2", type: "comment", user: "Karim Benzar", avatar: "KB", title: "Met Zidane at the supermarket", time: "15m ago", read: false },
  { id: "n3", type: "share", user: "Sophie Dubois", avatar: "SD", title: "Neighbor mistook me for his wife", time: "1h ago", read: false },
  { id: "n4", type: "follow", user: "Lucas Petit", avatar: "LP", time: "2h ago", read: true },
  { id: "n5", type: "like", user: "Amina Youssef", avatar: "AY", title: "Almost missed my flight to Japan", time: "3h ago", read: true },
  { id: "n6", type: "comment", user: "Thomas Roux", avatar: "TR", title: "50 pizzas delivered by mistake 🍕", time: "5h ago", read: true },
  { id: "n7", type: "like", user: "Jade Chen", avatar: "JC", title: "My cat when it sees a bird 🐱", time: "6h ago", read: true },
  { id: "n8", type: "share", user: "Omar Diallo", avatar: "OD", title: "My neighbor sings in the shower 😂", time: "8h ago", read: true },
];

const iconMap = {
  like: Heart,
  comment: MessageCircle,
  share: Share2,
  follow: UserPlus,
};

const actionText = {
  like: "liked your voice",
  comment: "commented on",
  share: "shared",
  follow: "started following you",
};

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

const NotificationsPanel = ({ open, onClose }: NotificationsPanelProps) => {
  const [notifications, setNotifications] = useState(mockNotifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-0 left-0 right-0 z-50 max-h-[80vh] bg-card border-b border-border/50 shadow-elevated overflow-y-auto rounded-b-2xl"
          >
            <div className="sticky top-0 bg-card/95 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-b border-border/30">
              <h2 className="text-lg font-bold font-display text-foreground">Notifications</h2>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary font-medium">
                    Mark all read
                  </button>
                )}
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="divide-y divide-border/30">
              {notifications.map((notif) => {
                const Icon = iconMap[notif.type];
                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className={`flex items-start gap-3 px-4 py-3 ${!notif.read ? "bg-primary/5" : ""}`}
                  >
                    <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
                      {notif.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">
                        <span className="font-semibold">{notif.user}</span>{" "}
                        <span className="text-muted-foreground">{actionText[notif.type]}</span>
                        {notif.title && (
                          <>
                            {" "}
                            <span className="font-medium">"{notif.title}"</span>
                          </>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{notif.time}</p>
                    </div>
                    <div className={`mt-1 ${notif.type === "like" ? "text-primary" : "text-muted-foreground"}`}>
                      <Icon size={16} className={notif.type === "like" ? "fill-primary" : ""} />
                    </div>
                    {!notif.read && (
                      <div className="w-2 h-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationsPanel;
