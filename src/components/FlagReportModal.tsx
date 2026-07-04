import { useState } from "react";
import { motion } from "framer-motion";
import { X, Flag, Ban, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface FlagReportModalProps {
  open: boolean;
  onClose: () => void;
  postId: string;
  authorId: string;
  authorName: string;
}

const FlagReportModal = ({ open, onClose, postId, authorId, authorName }: FlagReportModalProps) => {
  const { user } = useAuth();
  const [mode, setMode] = useState<"choose" | "report" | "block">("choose");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const reasons = [
    "Harassment or bullying",
    "Hate speech",
    "Explicit content",
    "Copyright violation",
    "Spam or misleading",
    "Other",
  ];

  const handleReport = async () => {
    if (!user || !reason.trim()) {
      toast.error("Please select a reason");
      return;
    }
    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from("reports")
        .insert({
          user_id: user.id,
          post_id: postId,
          reason: reason,
          status: "pending",
        });
      if (error) throw error;
      toast.success("Report submitted. Our team will review it within 24 hours.");
      setReason("");
      setMode("choose");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit report");
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!user) {
      toast.error("Sign in to block users");
      return;
    }
    setLoading(true);
    try {
      const { error } = await (supabase as any)
        .from("blocks")
        .insert({
          user_id: user.id,
          blocked_user_id: authorId,
        });
      if (error && error.code !== "23505") throw error; // ignore duplicate key
      toast.success(`Blocked ${authorName}. Their content is now hidden from your feed.`);
      setMode("choose");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to block user");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end bg-black/40 backdrop-blur-sm">
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="w-full bg-card rounded-t-3xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/20">
          <h3 className="text-lg font-bold text-foreground">
            {mode === "choose" ? "Manage Content" : mode === "report" ? "Report Post" : "Block User"}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {mode === "choose" && (
            <>
              <button
                onClick={() => setMode("report")}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-left"
              >
                <Flag size={18} className="text-yellow-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Report This Post</p>
                  <p className="text-xs text-muted-foreground">Help us keep the community safe</p>
                </div>
              </button>

              <button
                onClick={() => setMode("block")}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-left"
              >
                <Ban size={18} className="text-red-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">Block {authorName}</p>
                  <p className="text-xs text-muted-foreground">Hide their content from your feed</p>
                </div>
              </button>
            </>
          )}

          {mode === "report" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-3">Why are you reporting this post?</p>
              {reasons.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full p-3 rounded-lg border transition-colors text-left text-sm font-medium ${
                    reason === r
                      ? "bg-primary/20 border-primary text-foreground"
                      : "bg-card border-border/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {mode === "block" && (
            <div className="space-y-3">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  Blocking <strong>{authorName}</strong> will hide all their posts from your feed instantly. They won't be notified.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 p-4 border-t border-border/20 bg-card space-y-2">
          {mode !== "choose" && (
            <button
              onClick={() => setMode("choose")}
              className="w-full bg-secondary text-foreground py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              Back
            </button>
          )}

          {mode === "report" && (
            <button
              onClick={handleReport}
              disabled={loading || !reason}
              className="w-full bg-yellow-500/80 hover:bg-yellow-500 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Submitting..." : "Submit Report"}
            </button>
          )}

          {mode === "block" && (
            <button
              onClick={handleBlock}
              disabled={loading}
              className="w-full bg-red-500/80 hover:bg-red-500 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Blocking..." : "Block This User"}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default FlagReportModal;
