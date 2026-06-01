import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Profile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface LikesListModalProps {
  open: boolean;
  onClose: () => void;
  postId: string;
}

const LikesListModal = ({ open, onClose, postId }: LikesListModalProps) => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !postId) return;
    setProfiles([]);
    setLoading(true);
    const load = async () => {
      try {
        const { data: likes, error } = await supabase
          .from("voice_post_likes")
          .select("user_id")
          .eq("post_id", postId);

        if (error || !likes || likes.length === 0) {
          setProfiles([]);
          setLoading(false);
          return;
        }

        const ids = likes.map((l: any) => l.user_id);
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", ids);

        setProfiles((profilesData as Profile[]) || []);
      } catch {
        setProfiles([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open, postId]);

  const handleUserClick = (id: string) => {
    onClose();
    navigate(`/user/${id}`);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[61] flex justify-center"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            <div
              className="w-full max-w-sm bg-card rounded-t-2xl border border-border/50 shadow-elevated flex flex-col"
              style={{ maxHeight: "70vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border/30 shrink-0">
                <h3 className="text-base font-bold font-display text-foreground">Likes</h3>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 min-h-[100px]">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : profiles.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-12">
                    No likes yet
                  </p>
                ) : (
                  profiles.map((p) => {
                    const initials = (p.display_name || "U")
                      .split(" ")
                      .map((w) => w[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleUserClick(p.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors"
                      >
                        {p.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            alt=""
                            className="w-11 h-11 rounded-full object-cover border border-border/30"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
                            {initials}
                          </div>
                        )}
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">
                            {p.display_name || "User"}
                          </p>
                          {p.username && (
                            <p className="text-xs text-muted-foreground">@{p.username}</p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default LikesListModal;
