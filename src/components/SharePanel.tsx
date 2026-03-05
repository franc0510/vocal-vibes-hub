import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, Send, Link, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SharePanelProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  postTitle: string;
  postAuthor: string;
}

interface Friend {
  id: string;
  display_name: string;
  avatar_url: string | null;
  initials: string;
  sent?: boolean;
}

const SharePanel = ({ open, onClose, postId, postTitle, postAuthor }: SharePanelProps) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    loadFriends();
  }, [open, user?.id]);

  const loadFriends = async () => {
    if (!user) return;
    setLoading(true);

    // Get users we've messaged before
    const { data: msgs } = await supabase
      .from("messages")
      .select("sender_id, receiver_id")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .limit(200);

    const friendIds = new Set<string>();
    (msgs || []).forEach((m) => {
      if (m.sender_id !== user.id) friendIds.add(m.sender_id);
      if (m.receiver_id !== user.id) friendIds.add(m.receiver_id);
    });

    // Also search all users if no friends yet
    const { data: profiles } = friendIds.size > 0
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", Array.from(friendIds))
      : await supabase.from("profiles").select("id, display_name, avatar_url").neq("id", user.id).limit(20);

    setFriends((profiles || []).map((p) => {
      const initials = (p.display_name || "U").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
      return { id: p.id, display_name: p.display_name || "User", avatar_url: p.avatar_url, initials };
    }));
    setLoading(false);
  };

  const incrementShareCount = async () => {
    await (supabase.rpc as any)("increment_shares_count", { p_post_id: postId });
  };

  const sendToFriend = async (friend: Friend) => {
    if (!user) return;
    const shareUrl = `${window.location.origin}/?post=${postId}`;
    const content = `🎤 Check this out: "${postTitle}" ${shareUrl}`;

    const { error } = await supabase.from("messages").insert({
      sender_id: user.id,
      receiver_id: friend.id,
      content,
    } as any);

    if (error) {
      toast.error("Failed to send");
      return;
    }

    await incrementShareCount();
    setFriends((prev) => prev.map((f) => f.id === friend.id ? { ...f, sent: true } : f));
    toast.success(`Sent to ${friend.display_name}`);
  };

  const shareExternal = async () => {
    const url = `${window.location.origin}/?post=${postId}`;
    await incrementShareCount();
    if (navigator.share) {
      try {
        await navigator.share({ title: postTitle, text: `Listen to "${postTitle}" by ${postAuthor} on VocMe`, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/?post=${postId}`;
    await navigator.clipboard.writeText(url);
    await incrementShareCount();
    toast.success("Link copied!");
  };

  const filtered = search
    ? friends.filter((f) => f.display_name.toLowerCase().includes(search.toLowerCase()))
    : friends;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl max-h-[65vh] flex flex-col max-w-lg mx-auto border-t border-border/50"
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30">
              <h3 className="text-sm font-bold font-display text-foreground">Share</h3>
              <button onClick={onClose} className="text-muted-foreground"><X size={18} /></button>
            </div>

            {/* Search */}
            <div className="px-4 py-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search friends..."
                  className="w-full bg-secondary rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>

            {/* Friends list */}
            <div className="flex-1 overflow-y-auto px-4 py-1">
              {loading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">No friends found</p>
              ) : (
                <div className="space-y-1">
                  {filtered.map((friend) => (
                    <div key={friend.id} className="flex items-center gap-3 py-2">
                      {friend.avatar_url ? (
                        <img src={friend.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                          {friend.initials}
                        </div>
                      )}
                      <span className="flex-1 text-sm text-foreground font-medium">{friend.display_name}</span>
                      <button
                        onClick={() => sendToFriend(friend)}
                        disabled={friend.sent}
                        className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          friend.sent
                            ? "bg-secondary text-muted-foreground"
                            : "gradient-red text-primary-foreground shadow-red"
                        }`}
                      >
                        {friend.sent ? "Sent ✓" : "Send"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div className="px-4 py-3 border-t border-border/30 flex gap-2">
              <button
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 bg-secondary rounded-xl py-2.5 text-xs font-medium text-foreground hover:bg-secondary/80 transition-colors"
              >
                <Link size={14} />
                Copy link
              </button>
              <button
                onClick={shareExternal}
                className="flex-1 flex items-center justify-center gap-2 gradient-red rounded-xl py-2.5 text-xs font-medium text-primary-foreground shadow-red"
              >
                <ExternalLink size={14} />
                Share elsewhere
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SharePanel;
