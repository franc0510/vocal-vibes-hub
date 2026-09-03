import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { Trophy, Users, Calendar, Lock, Smartphone, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useCompetitionInvite } from "@/hooks/useCompetitionInvite";
import { APP_STORE_URL, inviteDeepLink } from "@/lib/appUrl";
import { rememberPendingInvite } from "@/lib/pendingInvite";

/**
 * L'écran qu'on voit en ouvrant un lien d'invitation.
 *
 * Il vit HORS de `ProtectedRoute`, et c'est tout l'intérêt : quelqu'un qui
 * reçoit une invitation n'a pas encore de compte. Le renvoyer vers la
 * connexion sans rien montrer, comme le fait le reste de l'application, revient
 * à demander de s'inscrire pour découvrir à quoi on est invité.
 *
 * Le code est retenu à travers l'inscription : sans ça, l'invitation était
 * perdue au premier écran d'authentification — `ProtectedRoute` remplace l'URL
 * au lieu de la garder.
 */

const JoinChallengePage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { invite, loading, failed, refresh } = useCompetitionInvite(code);
  const { join } = useCompetitions();

  const [joining, setJoining] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [triedApp, setTriedApp] = useState(false);

  const isNative = Capacitor.isNativePlatform();

  /**
   * Déjà membre : on n'a rien à demander, on ouvre.
   *
   * C'est le cas de celui qui reclique sur le lien qu'il a lui-même partagé,
   * et de l'organisateur qui vérifie son invitation.
   */
  useEffect(() => {
    if (invite?.is_member) navigate(`/competitions/${invite.id}`, { replace: true });
  }, [invite?.is_member, invite?.id, navigate]);

  const doJoin = async () => {
    if (!invite) return;
    // Pas encore connecté : on retient l'invitation et on revient dessus après.
    if (!user) {
      rememberPendingInvite(code ?? "");
      navigate("/auth");
      return;
    }
    if (invite.teams.length > 0 && !teamId) {
      toast.error("Pick your team first.");
      return;
    }
    setJoining(true);
    try {
      await join(invite.id, teamId);
      toast.success("You're in — good luck!");
      navigate(`/competitions/${invite.id}`, { replace: true });
    } catch (err) {
      // Déjà membre : la contrainte d'unicité remonte un 23505 illisible. Ce
      // n'est pas une erreur du point de vue de l'invité — il est dedans.
      const codeOf = (err as { code?: string })?.code;
      if (codeOf === "23505") {
        navigate(`/competitions/${invite.id}`, { replace: true });
        return;
      }
      toast.error("Could not join this challenge.");
      await refresh();
    } finally {
      setJoining(false);
    }
  };

  /** Ouvrir dans l'application installée, si elle l'est. */
  const openInApp = () => {
    setTriedApp(true);
    window.location.href = inviteDeepLink(code ?? "");
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
        <Trophy size={36} className="text-muted-foreground" />
        <p className="text-foreground font-medium">
          {failed ? "Could not load this invite" : "This invite link is not valid"}
        </p>
        <p className="text-sm text-muted-foreground">
          {failed
            ? "Check your connection and try again."
            : "The code may be wrong, or the challenge may have been deleted."}
        </p>
        {failed ? (
          <button onClick={refresh} className="mt-2 text-primary text-sm font-medium">Try again</button>
        ) : (
          <button onClick={() => navigate("/competitions")} className="mt-2 text-primary text-sm font-medium">
            Browse challenges
          </button>
        )}
      </div>
    );
  }

  const closed = !invite.is_open;

  return (
    <div className="min-h-screen bg-background overflow-x-hidden flex flex-col"
         style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex-1 flex flex-col justify-center px-5 py-8 max-w-lg w-full mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            You're invited to a challenge
          </p>

          <div className="rounded-2xl gradient-red p-5 text-primary-foreground">
            <h1 className="text-2xl font-bold leading-tight break-words">{invite.name}</h1>
            {invite.description && (
              <p className="text-sm opacity-90 mt-2 break-words">{invite.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] opacity-90">
              <span className="flex items-center gap-1">
                <Calendar size={11} /> {invite.day_count} day{invite.day_count === 1 ? "" : "s"}
              </span>
              <span className="flex items-center gap-1">
                <Users size={11} /> {invite.member_count} player{invite.member_count === 1 ? "" : "s"}
              </span>
              {invite.visibility === "private" && (
                <span className="flex items-center gap-1"><Lock size={11} /> Private</span>
              )}
            </div>
            {invite.prize && (
              <p className="text-sm font-medium mt-3 flex items-center gap-1.5">
                <Trophy size={14} className="shrink-0" />
                <span className="min-w-0 break-words">{invite.prize}</span>
              </p>
            )}
          </div>

          {/*
            Le camp se choisit ici, avant d'entrer — et il est définitif. Le
            montrer sur l'invitation évite de s'engager sans savoir entre quoi
            et quoi l'on choisit.
          */}
          {!closed && invite.teams.length > 0 && (
            <section className="mt-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Pick your team
              </h2>
              <div className="space-y-2">
                {invite.teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTeamId(t.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left ${
                      teamId === t.id
                        ? "border-primary bg-primary/10"
                        : "border-border/50"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: t.color ?? "hsl(var(--muted-foreground))" }}
                    />
                    <span className="font-medium text-foreground truncate">{t.name}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                You only pick once, when you join — and it's final.
              </p>
            </section>
          )}

          {closed ? (
            <p className="mt-5 text-sm text-muted-foreground text-center">
              This challenge is over — you can no longer join it.
            </p>
          ) : (
            <button
              onClick={doJoin}
              disabled={joining}
              className="mt-6 w-full rounded-xl gradient-red text-primary-foreground font-medium py-3.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {joining ? "Joining…" : user ? "Join the challenge" : "Sign in and join"}
              {!joining && <ArrowRight size={16} />}
            </button>
          )}

          {/*
            Sur le web, l'application installée fait mieux que le navigateur.
            Le schème `vocme://` l'ouvre — mais il ne dit rien quand elle est
            absente, d'où le repli révélé seulement après une tentative, plutôt
            qu'une redirection automatique qui déclencherait une alerte iOS
            chez tous ceux qui n'ont pas l'application.
          */}
          {!isNative && !closed && (
            <div className="mt-4 text-center">
              <button
                onClick={openInApp}
                className="text-sm font-medium text-primary inline-flex items-center gap-1.5"
              >
                <Smartphone size={14} /> Open in the VocMe app
              </button>
              {triedApp && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Nothing happened?{" "}
                  {APP_STORE_URL ? (
                    <a href={APP_STORE_URL} className="text-primary underline">
                      Get VocMe on the App Store
                    </a>
                  ) : (
                    "You can keep going right here in your browser."
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

export default JoinChallengePage;
