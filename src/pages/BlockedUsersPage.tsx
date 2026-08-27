import { useEffect, useState } from "react";
import { ArrowLeft, Ban } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The accounts this user has blocked, and the way back.
 *
 * The app could block from three places and unblock from none, so a tap made
 * in irritation was permanent — and invisible: blocked authors simply vanish
 * from the feed, with nothing to say why or how to undo it.
 *
 * `blocks` is absent from the generated types, so the client is narrowed to the
 * calls this page makes rather than widened to `any`.
 */
interface BlockedRow {
  blocked_user_id: string;
  created_at: string;
  display_name: string | null;
  avatar_url: string | null;
}

const db = supabase as unknown as {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: string) => {
        order: (c: string, o: { ascending: boolean }) => Promise<{
          data: { blocked_user_id: string; created_at: string }[] | null;
        }>;
      };
    };
    delete: () => {
      eq: (c: string, v: string) => {
        eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  };
};

const BlockedUsersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);

    const { data } = await db
      .from("blocks")
      .select("blocked_user_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const blocks = data ?? [];
    if (blocks.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    // Names come from profiles; a block whose profile is gone still has to be
    // listed, or it could never be undone.
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", blocks.map((b) => b.blocked_user_id));

    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setRows(
      blocks.map((b) => ({
        blocked_user_id: b.blocked_user_id,
        created_at: b.created_at,
        display_name: byId.get(b.blocked_user_id)?.display_name ?? null,
        avatar_url: byId.get(b.blocked_user_id)?.avatar_url ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unblock = async (blockedId: string, name: string) => {
    if (!user) return;
    setBusy(blockedId);
    const { error } = await db.from("blocks").delete().eq("user_id", user.id).eq("blocked_user_id", blockedId);
    setBusy(null);

    if (error) {
      toast.error(error.message || "Impossible de débloquer");
      return;
    }
    setRows((prev) => prev.filter((r) => r.blocked_user_id !== blockedId));
    toast.success(`${name} est débloqué — ses anecdotes reviennent dans ton feed.`);
  };

  return (
    <div
      className="min-h-screen pb-24 px-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
    >
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Retour"
          className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-foreground font-display">Comptes bloqués</h1>
      </header>

      {loading ? (
        <div className="flex justify-center pt-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center pt-12">
          <Ban size={36} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Tu n'as bloqué personne.</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            Les anecdotes de ces comptes n'apparaissent ni dans ton feed ni dans l'exploration.
          </p>
          <ul className="space-y-2">
            {rows.map((r) => {
              const name = r.display_name || "Compte supprimé";
              const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <li
                  key={r.blocked_user_id}
                  className="flex items-center gap-3 bg-card border border-border/50 rounded-xl px-4 py-3"
                >
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full gradient-red flex items-center justify-center text-xs font-bold text-primary-foreground">
                      {initials}
                    </div>
                  )}
                  <p className="flex-1 text-sm font-medium text-foreground">{name}</p>
                  <button
                    onClick={() => unblock(r.blocked_user_id, name)}
                    disabled={busy === r.blocked_user_id}
                    className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
                  >
                    {busy === r.blocked_user_id ? "…" : "Débloquer"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};

export default BlockedUsersPage;
