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

interface FollowListModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  type: "followers" | "following";
}

const FollowListModal = ({ open, onClose, userId, type }: FollowListModalProps) => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId) return;
    const load = async () => {
      setLoading(true);
      const column = type === "followers" ? "follower_id" : "following_id";
      const filterColumn = type === "followers" ? "following_id" : "follower_id";
      const { data: follows } = await supabase
        .from("follows")
        .select(column)
        .eq(filterColumn, userId);

      if (!follows || follows.length === 0) {
        setProfiles([]);
        setLoading(false);
        return;
      }

      const ids = follows.map((f: any) => f[column]);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);

      setProfiles((profilesData as Profile[]) || []);
      setLoading(false);
    };
    load();
  }, [open, userId, type]);

  const handleUserClick = (id: string) => {
    onClose();
    navigate(`/user/${id}`);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex items-end sm:items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="w-full max-w-sm bg-card rounded-t-2xl sm:rounded-2xl border border-border/50 shadow-elevated max-h-[70vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b border-border/30">
            <h3 className="text-sm font-bold font-display text-foreground capitalize">{type}</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : profiles.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                {type === "followers" ? "Aucun abonné" : "Aucun abonnement"}
              </p>
            ) : (
              profiles.map((p) => {
                const initials = (p.display_name || "U").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <button
                    key={p.id}
                    onClick={() => handleUserClick(p.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary/60 transition-colors"
                  >
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover border border-border/30" />
                    ) : (
                      <div className="w-11 h-11 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
                        {initials}
                      </div>
                    )}
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{p.display_name || "User"}</p>
                      {p.username && <p className="text-xs text-muted-foreground">@{p.username}</p>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default FollowListModal;
