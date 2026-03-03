import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, UserPlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  type: "like" | "comment" | "share" | "follow";
  actor_name: string;
  actor_avatar: string;
  post_title?: string;
  created_at: string;
  read: boolean;
}

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

const formatTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
}

const NotificationsPanel = ({ open, onClose }: NotificationsPanelProps) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);

    const { data: rawNotifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!rawNotifs || rawNotifs.length === 0) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    // Get actor profiles
    const actorIds = [...new Set(rawNotifs.map((n) => n.actor_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", actorIds);
    const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

    // Get post titles
    const postIds = [...new Set(rawNotifs.filter((n) => n.post_id).map((n) => n.post_id!))];
    let postMap = new Map<string, string>();
    if (postIds.length > 0) {
      const { data: posts } = await supabase
        .from("voice_posts")
        .select("id, title")
        .in("id", postIds);
      postMap = new Map((posts || []).map((p) => [p.id, p.title]));
    }

    const enriched: Notification[] = rawNotifs.map((n) => {
      const actor = profileMap.get(n.actor_id);
      const initials = (actor?.display_name || "U")
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return {
        id: n.id,
        type: n.type as Notification["type"],
        actor_name: actor?.display_name || "Someone",
        actor_avatar: initials,
        post_title: n.post_id ? postMap.get(n.post_id) : undefined,
        created_at: n.created_at,
        read: n.read,
      };
    });

    setNotifications(enriched);
    setLoading(false);
  };

  useEffect(() => {
    if (open && user) {
      fetchNotifications();
    }
  }, [open, user?.id]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
        fetchNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const markAllRead = async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("user_id", user.id)
      .eq("read", false);
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
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const Icon = iconMap[notif.type];
                  return (
                    <div
                      key={notif.id}
                      className={`flex items-center gap-3 px-4 py-3 ${!notif.read ? "bg-primary/5" : ""}`}
                    >
                      <div className="w-8 h-8 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                        {notif.actor_avatar}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground leading-snug">
                          <span className="font-semibold">{notif.actor_name}</span>{" "}
                          <span className="text-muted-foreground">{actionText[notif.type]}</span>
                          {notif.post_title && <span className="font-medium"> "{notif.post_title}"</span>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{formatTime(notif.created_at)}</p>
                      </div>
                      <div className={`${notif.type === "like" ? "text-primary" : "text-muted-foreground"}`}>
                        <Icon size={14} className={notif.type === "like" ? "fill-primary" : ""} />
                      </div>
                      {!notif.read && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationsPanel;
