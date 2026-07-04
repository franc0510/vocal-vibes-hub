import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, UserPlus, X, Users, Mic, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  type: "like" | "comment" | "share" | "follow" | "group_added" | "group_post" | "friend_post" | "weekly_winner";
  actor_id: string;
  actor_name: string;
  actor_avatar: string;
  post_id?: string;
  post_title?: string;
  group_id?: string;
  group_name?: string;
  created_at: string;
  read: boolean;
}

const iconMap: Record<string, any> = {
  like: Heart,
  comment: MessageCircle,
  share: Share2,
  follow: UserPlus,
  group_added: Users,
  group_post: Mic,
  friend_post: Mic,
  weekly_winner: Crown,
};

const getActionText = (notif: Notification) => {
  switch (notif.type) {
    case "like": return "liked your voice";
    case "comment": return "commented on";
    case "share": return "shared";
    case "follow": return "started following you";
    case "group_added": return `added you to the group "${notif.group_name || "a group"}"`;
    case "group_post": return `added a VocMe in the group "${notif.group_name || "a group"}"`;
    case "friend_post": return "added a new VocMe";
    case "weekly_winner": return "🏆 Your VocMe was crowned VocMe of the Week!";
    default: return "interacted";
  }
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
  const navigate = useNavigate();
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

    // Get group names
    const groupIds = [...new Set(rawNotifs.filter((n: any) => n.group_id).map((n: any) => n.group_id!))];
    let groupMap = new Map<string, string>();
    if (groupIds.length > 0) {
      const { data: groups } = await (supabase as any)
        .from("groups")
        .select("id, name")
        .in("id", groupIds);
      groupMap = new Map((groups || []).map((g: any) => [g.id, g.name]));
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
        actor_id: n.actor_id,
        actor_name: actor?.display_name || "Someone",
        actor_avatar: initials,
        post_id: n.post_id || undefined,
        post_title: n.post_id ? postMap.get(n.post_id) : undefined,
        group_id: (n as any).group_id || undefined,
        group_name: (n as any).group_id ? groupMap.get((n as any).group_id) : undefined,
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
      // Auto-mark all as read shortly after opening so the bell badge
      // clears (the user has now "seen" the list).
      const t = setTimeout(() => {
        markAllRead();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [open, user?.id]);

  // Realtime — refresh the in-app list. Device banners are fired app-wide by
  // useRealtimeNotifications (so they work regardless of the current page).
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications_panel_list")
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
            className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto"
          >
            {/* Safe area top spacer */}
            <div className="bg-background shrink-0" style={{ height: "env(safe-area-inset-top, 0px)" }} />

            <div className="px-4 py-3 flex items-center justify-between border-b border-border/30 shrink-0">
              <h2 className="text-lg font-bold font-display text-foreground">Notifications</h2>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-primary font-medium">
                    Mark all read
                  </button>
                )}
                <button onClick={onClose} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Close notifications">
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border/30" style={{ paddingBottom: "env(safe-area-inset-bottom, 80px)" }}>
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
                  const isWeeklyWin = notif.type === "weekly_winner";
                  return (
                    <div
                      key={notif.id}
                      className={`flex items-center gap-3 px-4 py-3 ${isWeeklyWin ? "bg-amber-400/10" : !notif.read ? "bg-primary/5" : ""}`}
                    >
                      <button
                        onClick={() => {
                          onClose();
                          if (isWeeklyWin) { navigate("/weekly"); return; }
                          navigate(`/user/${notif.actor_id}`);
                        }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${isWeeklyWin ? "bg-amber-400/30 border border-amber-400/50" : "gradient-red text-primary-foreground"}`}
                        aria-label={isWeeklyWin ? "VocMe of the Week" : `View ${notif.actor_name}'s profile`}
                      >
                        {isWeeklyWin ? <Crown size={14} className="text-amber-400 fill-amber-400" /> : notif.actor_avatar}
                      </button>
                      <button
                        onClick={() => {
                          onClose();
                          if (isWeeklyWin) { navigate("/weekly"); return; }
                          // For post-related notifications (like, comment, share,
                          // friend_post, group_post) → open the post directly.
                          // For follow / group_added → open the actor's profile.
                          if (notif.post_id && (notif.type === "like" || notif.type === "comment" || notif.type === "share" || notif.type === "friend_post" || notif.type === "group_post")) {
                            navigate(`/post/${notif.post_id}`);
                          } else {
                            navigate(`/user/${notif.actor_id}`);
                          }
                        }}
                        className="flex-1 min-w-0 text-left"
                      >
                        <p className="text-xs text-foreground leading-snug">
                          {!isWeeklyWin && <><span className="font-semibold">{notif.actor_name}</span>{" "}</>}
                          <span className={isWeeklyWin ? "font-semibold text-amber-300" : "text-muted-foreground"}>{getActionText(notif)}</span>
                          {notif.post_title && notif.type !== "group_added" && notif.type !== "group_post" && (
                            <span className="font-medium"> "{notif.post_title}"</span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{formatTime(notif.created_at)}</p>
                      </button>
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
