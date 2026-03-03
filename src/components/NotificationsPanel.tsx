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
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-0 left-0 right-0 bottom-0 z-50 bg-background flex flex-col max-w-lg mx-auto"
          >
            <div className="px-4 py-3 flex items-center justify-between border-b border-border/30">
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

            <div className="flex-1 overflow-y-auto divide-y divide-border/30">
              {notifications.map((notif) => {
                const Icon = iconMap[notif.type];
                return (
                  <div
                    key={notif.id}
                    className={`flex items-center gap-3 px-4 py-3 ${!notif.read ? "bg-primary/5" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                      {notif.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground leading-snug">
                        <span className="font-semibold">{notif.user}</span>{" "}
                        <span className="text-muted-foreground">{actionText[notif.type]}</span>
                        {notif.title && <span className="font-medium"> "{notif.title}"</span>}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{notif.time}</p>
                    </div>
                    <div className={`${notif.type === "like" ? "text-primary" : "text-muted-foreground"}`}>
                      <Icon size={14} className={notif.type === "like" ? "fill-primary" : ""} />
                    </div>
                    {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                  </div>
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
