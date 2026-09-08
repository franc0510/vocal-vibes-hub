import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { Users, Smartphone, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useGroups } from "@/hooks/useGroups";
import { useGroupInvite } from "@/hooks/useGroupInvite";
import { groupInviteDeepLink } from "@/lib/appUrl";
import { useOpenInApp } from "@/hooks/useOpenInApp";
import { rememberPendingInvite } from "@/lib/pendingInvite";

/**
 * L'écran qu'on voit en ouvrant un lien d'invitation à un groupe.
 *
 * Jumeau de `JoinChallengePage`, et pour les mêmes raisons : il vit HORS de
 * `ProtectedRoute`, parce que quelqu'un qui reçoit une invitation n'a pas
 * encore de compte. Le renvoyer vers la connexion sans rien montrer revient à
 * demander de s'inscrire pour découvrir à quoi on est invité.
 *
 * Le code est retenu à travers l'inscription : sans ça, l'invitation serait
 * perdue au premier écran d'authentification.
 */

const JoinGroupPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { invite, loading, failed, refresh } = useGroupInvite(code);
  const { joinWithCode } = useGroups();

  const [joining, setJoining] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  /**
   * Ouvrir dans l'application, ou emmener la télécharger.
   *
   * Le schème ne dit rien quand l'application est absente : le hook tente,
   * observe, et bascule vers la boutique si la page est toujours là.
   */
  const {
    open: openInApp,
    downloadUrl,
    appMissing,
  } = useOpenInApp(groupInviteDeepLink(code ?? ""));

  /**
   * Déjà membre : on n'a rien à demander, on ouvre.
   *
   * C'est le cas de celui qui reclique sur le lien qu'il a lui-même partagé,
   * et du propriétaire qui vérifie son invitation.
   */
  useEffect(() => {
    if (invite?.is_member) navigate("/groups", { replace: true });
  }, [invite?.is_member, navigate]);

  const doJoin = async () => {
    if (!invite || !code) return;
    // Pas encore connecté : on retient l'invitation et on revient dessus après.
    if (!user) {
      rememberPendingInvite(code, "group");
      navigate("/auth");
      return;
    }
    setJoining(true);
    try {
      const joined = await joinWithCode(code);
      if (!joined) {
        toast.error("This invite link is no longer valid.");
        await refresh();
        return;
      }
      toast.success(`Welcome to "${joined.name}"!`);
      navigate("/groups", { replace: true });
    } catch {
      toast.error("Could not join this group.");
      await refresh();
    } finally {
      setJoining(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Users size={36} className="text-muted-foreground" />
        <p className="text-foreground font-medium">
          {failed ? "Could not load this invite" : "This invite link is not valid"}
        </p>
        <p className="text-sm text-muted-foreground">
          {failed
            ? "Check your connection and try again."
            : "The code may be wrong, or the group may have been deleted."}
        </p>
        {failed ? (
          <button onClick={refresh} className="mt-2 text-primary text-sm font-medium">Try again</button>
        ) : (
          <button onClick={() => navigate("/groups")} className="mt-2 text-primary text-sm font-medium">
            Go to my groups
          </button>
        )}
      </div>
    );
  }

  const host = invite.owner_name || (invite.owner_username ? `@${invite.owner_username}` : null);
  const initials = (invite.name || "G").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden flex flex-col"
         style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex-1 flex flex-col justify-center px-5 py-8 max-w-lg w-full mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {/* Qui invite : un nom rassure là où un lien seul inquiète. */}
            {host ? `${host} invites you to a group` : "You're invited to a group"}
          </p>

          <div className="rounded-2xl gradient-red p-5 text-primary-foreground">
            <div className="flex items-center gap-3">
              {invite.owner_avatar_url ? (
                <img
                  src={invite.owner_avatar_url}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover border border-primary-foreground/30 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold shrink-0">
                  {initials}
                </div>
              )}
              <h1 className="text-2xl font-bold leading-tight break-words min-w-0">{invite.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] opacity-90">
              <span className="flex items-center gap-1">
                <Users size={11} /> {invite.member_count} member{invite.member_count === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Members share VocMe recordings that stay inside the group — nobody
            else sees them.
          </p>

          <button
            onClick={doJoin}
            disabled={joining}
            className="mt-6 w-full rounded-xl gradient-red text-primary-foreground font-medium py-3.5 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {joining ? "Joining…" : user ? "Join the group" : "Sign in and join"}
            {!joining && <ArrowRight size={16} />}
          </button>

          {/*
            Sur le web, l'application installée fait mieux que le navigateur.
            Le schème `vocme://` l'ouvre — mais il ne dit rien quand elle est
            absente : le bouton restait mort, sans jamais proposer de
            télécharger. `useOpenInApp` tente l'application, puis part vers la
            boutique si rien ne s'est ouvert.
          */}
          {!isNative && (
            <div className="mt-4 text-center">
              <button
                onClick={openInApp}
                className="text-sm font-medium text-primary inline-flex items-center gap-1.5"
              >
                <Smartphone size={14} /> Open in the VocMe app
              </button>
              {appMissing && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  {downloadUrl ? (
                    <>
                      Taking you to the App Store —{" "}
                      <a href={downloadUrl} className="text-primary underline">
                        get VocMe
                      </a>
                    </>
                  ) : (
                    "Looks like you don't have the app. You can keep going right here in your browser."
                  )}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default JoinGroupPage;
