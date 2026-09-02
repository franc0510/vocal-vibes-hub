import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, Trophy, Users, Mic, Settings, Sparkles, Share2, Crown, Check,
  Copy, Lock, CalendarPlus, CircleDot, Circle, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/untyped";
import { useAuth } from "@/contexts/AuthContext";
import CompetitionDayBallot from "@/components/CompetitionDayBallot";
import {
  DEFAULT_TIMEZONE, formatCountdown, msUntilRollover, themeIsRevealed,
} from "@/lib/competitionClock";
import { useCompetition } from "@/hooks/useCompetition";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useCompetitionScores } from "@/hooks/useCompetitionScores";

/**
 * Une compétition : le thème du jour, l'urne, et les deux classements.
 *
 * Toujours les deux classements. Celui des équipes décide de la soirée ; celui
 * des joueurs fait le travail au quotidien — « je suis 4e de mon école » pousse
 * à publier bien plus qu'un total collectif où personne ne se reconnaît. Sans
 * équipes, seul le second existe, et il désigne le vainqueur.
 */

interface Profile { id: string; display_name: string | null; avatar_url: string | null }

const daysLeft = (endsOn: string) => {
  const end = new Date(`${endsOn}T23:59:59`);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
};

const CompetitionPage = () => {
  const { competitionId } = useParams<{ competitionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    competition, teams, days, membership, currentDay, today,
    isOwner, isMember, isOver, loading, chooseTeam, refresh,
  } = useCompetition(competitionId);
  const { join } = useCompetitions();
  const { players, teams: teamScores, final } = useCompetitionScores(competitionId);
  const timezone = competition?.timezone ?? DEFAULT_TIMEZONE;

  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [myPostToday, setMyPostToday] = useState<string | null>(null);
  const [tab, setTab] = useState<"teams" | "players">("teams");
  const [onlyMyTeam, setOnlyMyTeam] = useState(false);
  const [picking, setPicking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sans équipes, l'onglet « équipes » n'aurait rien à montrer.
  useEffect(() => {
    if (teams.length === 0) setTab("players");
  }, [teams.length]);

  /**
   * Mon anecdote du jour, s'il y en a une.
   *
   * C'est ce qui referme la boucle enregistrement → défi : sans elle, on publie
   * et l'écran du défi reste identique, si bien qu'on republie en croyant que
   * ça n'a pas marché.
   */
  useEffect(() => {
    if (!currentDay || !user) { setMyPostToday(null); return; }
    let cancelled = false;
    db.from("voice_posts")
      .select("id")
      .eq("competition_day_id", currentDay.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        if (!cancelled) setMyPostToday(data?.id ?? null);
      });
    return () => { cancelled = true; };
  }, [currentDay, user]);

  useEffect(() => {
    const ids = players.map((p) => p.user_id);
    if (ids.length === 0) return;
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids)
      .then(({ data }) => setProfiles(new Map((data ?? []).map((p) => [p.id, p as Profile]))));
  }, [players]);

  const teamName = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams]
  );

  const shownPlayers = useMemo(() => {
    if (!onlyMyTeam || !membership?.team_id) return players;
    return players
      .filter((p) => p.team_id === membership.team_id)
      // Filtrer une liste déjà classée laisserait les rangs 3, 7, 12 : dans son
      // équipe, on veut savoir qu'on est 2e, pas 7e du tout.
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }, [players, onlyMyTeam, membership?.team_id]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!competition) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Trophy size={36} className="text-muted-foreground" />
        <p className="text-foreground font-medium">Challenge not found</p>
        <p className="text-sm text-muted-foreground">
          It may be private — you need an invite or its code.
        </p>
        <button onClick={() => navigate("/competitions")} className="mt-2 text-primary text-sm font-medium">
          Back
        </button>
      </div>
    );
  }

  const inviteText = competition.join_code
    ? `Join "${competition.name}" on VocMe with code ${competition.join_code}!`
    : `Join "${competition.name}" on VocMe!`;

  const copyCode = async () => {
    if (!competition.join_code) return;
    try {
      await navigator.clipboard.writeText(competition.join_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy the code.");
    }
  };

  const shareInvite = async () => {
    try {
      if (navigator.share) await navigator.share({ text: inviteText });
      else {
        await navigator.clipboard.writeText(inviteText);
        toast.success("Invite copied");
      }
    } catch { /* partage annulé */ }
  };

  /**
   * Rejoindre, en choisissant son camp.
   *
   * Le choix se fait ici et nulle part ailleurs : une équipe qu'on peut changer
   * tant qu'on veut est une équipe qu'on rejoint la veille de la clôture, quand
   * on sait déjà qui gagne. Un trigger pose le verrou en base au moment même de
   * l'inscription — l'écran ne fait que refléter la règle.
   */
  const doJoin = async (teamId: string | null) => {
    try {
      await join(competition.id, teamId);
      setPicking(false);
      toast.success(teamId ? "You're in — good luck!" : "You're in the challenge!");
      await refresh();
    } catch {
      toast.error("Could not join.");
    }
  };

  const noDays = days.length === 0;

  return (
    <div className="min-h-screen bg-background pb-28 overflow-x-hidden">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2 px-3 py-3">
          <button onClick={() => navigate("/competitions")} className="p-1 text-foreground shrink-0">
            <ChevronLeft size={22} />
          </button>
          <h1 className="flex-1 min-w-0 font-bold text-foreground truncate">{competition.name}</h1>
          <button onClick={() => setSharing(true)} className="p-1.5 text-foreground shrink-0">
            <Share2 size={18} />
          </button>
          {isOwner && (
            <button onClick={() => navigate(`/competitions/${competition.id}/edit`)}
                    className="p-1.5 text-foreground shrink-0">
              <Settings size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">
        {/*
          Un défi sans jour n'a ni thème, ni urne, ni programme : l'écran était
          alors vide, sans un mot d'explication. C'est exactement ce qu'a vu le
          premier testeur, sur une compétition dont les jours avaient été
          refusés en silence à la création.
        */}
        {noDays ? (
          <div className="rounded-2xl border border-dashed border-border/60 p-5 text-center">
            <Trophy size={28} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-foreground font-medium">This challenge has no days yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              A challenge is made of days, each with its own theme. Without them
              there is nothing to record and nothing to vote on.
            </p>
            {isOwner && (
              <button
                onClick={() => navigate(`/competitions/${competition.id}/edit`)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full gradient-red text-primary-foreground text-sm font-medium"
              >
                <CalendarPlus size={15} /> Add days
              </button>
            )}
          </div>
        ) : currentDay ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl gradient-red p-4 text-primary-foreground">
            <p className="text-[11px] uppercase tracking-wide opacity-80">
              Day {currentDay.day_index} · {daysLeft(competition.ends_on)} day(s) left
            </p>
            <p className="text-lg font-bold mt-1 leading-snug break-words">{currentDay.theme}</p>
            {isMember && (
              <>
                <button
                  onClick={() => navigate(`/record?competitionDay=${currentDay.id}`)}
                  className="mt-3 w-full bg-primary-foreground/15 backdrop-blur rounded-xl py-2.5 font-medium text-sm flex items-center justify-center gap-2"
                >
                  <Mic size={16} />
                  {myPostToday ? "Record another one" : "Record mine"}
                </button>
                {myPostToday && (
                  <button
                    onClick={() => navigate(`/post/${myPostToday}`)}
                    className="mt-2 w-full text-[11px] opacity-90 flex items-center justify-center gap-1.5"
                  >
                    <Check size={12} /> Your story is in today's running
                  </button>
                )}
              </>
            )}
          </motion.div>
        ) : (
          <div className="rounded-2xl bg-card border border-border/40 p-4">
            <p className="text-sm text-foreground font-medium">
              {isOver ? "Challenge over" : `Starts on ${competition.starts_on}`}
            </p>
            {competition.prize && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <Trophy size={12} className="text-amber-400 shrink-0" />
                <span className="min-w-0 break-words">{competition.prize}</span>
              </p>
            )}
          </div>
        )}

        {!isMember && !isOver && (
          <button
            onClick={() => (teams.length > 0 ? setPicking(true) : doJoin(null))}
            className="w-full rounded-xl gradient-red text-primary-foreground font-medium py-3"
          >
            Join
          </button>
        )}

        {/*
          Le camp se choisit en entrant. Ce bloc ne sert donc qu'au cas de
          bordure : un membre entré sans équipe — inscrit avant que le créateur
          n'en ajoute. Il choisit alors une fois, et c'est verrouillé.
        */}
        {isMember && teams.length > 0 && !membership?.team_id && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Pick your team
            </h2>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={async () => {
                    try { await chooseTeam(t.id); toast.success("Team locked in"); }
                    catch (err) { toast.error(err instanceof Error ? err.message : "Refused"); }
                  }}
                  className="px-3.5 py-2 rounded-full text-sm font-medium border border-border/50 text-muted-foreground"
                >
                  {t.name}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              You only pick once — this choice is final.
            </p>
          </section>
        )}

        {isMember && membership?.team_id && (
          <section className="flex items-center gap-2 text-sm">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Your team</span>
            <span className="px-3 py-1 rounded-full text-sm font-medium border border-primary text-primary bg-primary/10 flex items-center gap-1.5 min-w-0">
              <Lock size={11} className="shrink-0" />
              <span className="truncate">{teamName.get(membership.team_id)}</span>
            </span>
          </section>
        )}

        {/* L'urne du jour — écouter, puis élire. */}
        {!noDays && (
          <CompetitionDayBallot
            competitionId={competitionId}
            days={days}
            currentDay={currentDay}
            timezone={timezone}
            isMember={isMember}
            onRecord={currentDay ? () => navigate(`/record?competitionDay=${currentDay.id}`) : undefined}
          />
        )}

        {/* Les classements. */}
        <section>
          <div className="flex items-center justify-between mb-2 gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground min-w-0 truncate">
              Standings
            </h2>
            {/* Le bonus du jour est le seul point encore en jeu : les autres
                sont déjà comptés. Annoncer l'heure du dépouillement vaut mieux
                qu'un total mystérieux « à venir ». */}
            {!final && currentDay && (
              <span className="text-[11px] text-amber-400 flex items-center gap-1 shrink-0">
                <Sparkles size={11} /> Today's bonus in{" "}
                {formatCountdown(msUntilRollover(new Date(), timezone))}
              </span>
            )}
          </div>

          {teams.length > 0 && (
            <div className="flex gap-1 p-1 bg-card rounded-xl border border-border/40 mb-3">
              {(["teams", "players"] as const).map((key) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${
                    tab === key ? "gradient-red text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {key === "teams" ? "Teams" : "Players"}
                </button>
              ))}
            </div>
          )}

          {tab === "teams" ? (
            <div className="space-y-1.5">
              {teamScores.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nothing scored yet.
                </p>
              )}
              {teamScores.map((t) => (
                <div key={t.team_id} className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-3 py-2.5">
                  <span className={`w-6 text-center font-bold shrink-0 ${t.rank === 1 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {t.rank}
                  </span>
                  {t.rank === 1 && final && <Crown size={15} className="text-amber-400 shrink-0" />}
                  <span className="flex-1 min-w-0 font-medium text-foreground truncate">
                    {teamName.get(t.team_id ?? "") ?? "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1 shrink-0">
                    <Users size={11} />{t.members}
                  </span>
                  <span className="font-bold text-foreground tabular-nums shrink-0">{t.score}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {membership?.team_id && (
                <button
                  onClick={() => setOnlyMyTeam((v) => !v)}
                  className={`text-[11px] mb-2 font-medium flex items-center gap-1 ${
                    onlyMyTeam ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {/* Icônes plutôt que ◉/○ : ces glyphes dépendent de la police
                      de la WebView, celle-là même qui rendait le 🏆 en « ? ». */}
                  {onlyMyTeam ? <CircleDot size={12} /> : <Circle size={12} />}
                  My team only
                </button>
              )}
              <div className="space-y-1.5">
                {shownPlayers.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Nothing scored yet.
                  </p>
                )}
                {shownPlayers.map((p) => {
                  const profile = profiles.get(p.user_id);
                  const me = p.user_id === user?.id;
                  return (
                    <div
                      key={p.user_id}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${
                        me ? "border-primary/50 bg-primary/5" : "border-border/40 bg-card"
                      }`}
                    >
                      <span className={`w-6 text-center font-bold shrink-0 ${p.rank === 1 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {p.rank}
                      </span>
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-7 h-7 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                          {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {profile?.display_name ?? "Anonymous"}
                        </p>
                        {p.team_id && !onlyMyTeam && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {teamName.get(p.team_id)}
                          </p>
                        )}
                      </div>
                      <span className="font-bold text-foreground tabular-nums shrink-0">{p.score}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/*
          Le programme.
          
          Les thèmes à venir sont masqués aux joueurs : un défi vit de ce qu'on
          découvre le matin même. Tout afficher d'avance permettait de préparer
          six anecdotes le premier soir, et retirait toute raison de rouvrir
          l'application les jours suivants. Le créateur, lui, voit tout — c'est
          lui qui écrit le programme.

          Le masquage est présentationnel : la politique RLS laisse un membre
          lire toutes les lignes, et RLS ne sait pas masquer une colonne. Le
          faire tenir côté serveur demanderait de passer les lectures par une
          vue — un chantier à part.
        */}
        {!noDays && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              The {days.length} days
            </h2>
            <div className="space-y-1">
              {days.map((d) => {
                const isToday = currentDay?.id === d.id;
                const revealed = isOwner || themeIsRevealed(d.date, today);
                return (
                  <div
                    key={d.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                      isToday ? "bg-primary/10 border border-primary/40" : ""
                    }`}
                  >
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground shrink-0">
                      {d.day_index}
                    </span>
                    {revealed ? (
                      <span className={`flex-1 min-w-0 text-sm break-words ${
                        isToday ? "text-foreground font-medium" : "text-muted-foreground"
                      }`}>
                        {d.theme}
                      </span>
                    ) : (
                      <span className="flex-1 min-w-0 text-sm text-muted-foreground/60 italic flex items-center gap-1.5">
                        <Lock size={11} className="shrink-0" /> Revealed that morning
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Choisir son camp, au moment d'entrer. */}
      <AnimatePresence>
        {picking && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center"
            onClick={() => setPicking(false)}
          >
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-card border-t sm:border border-border/40 sm:rounded-2xl p-5 space-y-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <h2 className="font-bold text-foreground">Pick your team</h2>
              <p className="text-sm text-muted-foreground">
                You choose once, when you join — and it's final. That's what keeps
                anyone from switching to the winning side on the last day.
              </p>
              <div className="space-y-2 pt-1">
                {teams.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => doJoin(t.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 text-left"
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: t.color ?? "hsl(var(--muted-foreground))" }}
                    />
                    <span className="font-medium text-foreground truncate">{t.name}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setPicking(false)} className="w-full py-2 text-sm text-muted-foreground">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Le code d'invitation, lisible et copiable. */}
      <AnimatePresence>
        {sharing && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-end sm:items-center justify-center"
            onClick={() => setSharing(false)}
          >
            <motion.div
              initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-card border-t sm:border border-border/40 sm:rounded-2xl p-5 space-y-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-foreground min-w-0 truncate">Invite friends</h2>
                <button onClick={() => setSharing(false)} className="p-1 text-muted-foreground shrink-0">
                  <X size={18} />
                </button>
              </div>

              {/*
                Le code était jusqu'ici enfoui dans le texte de partage, donc
                invisible : l'organisateur ne pouvait pas lire son propre code
                pour le dicter au téléphone ou l'écrire au tableau.
              */}
              {competition.join_code && (
                <button
                  onClick={copyCode}
                  className="w-full rounded-xl border border-border/50 bg-background px-4 py-4 flex items-center justify-between gap-3"
                >
                  <span className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground min-w-0 truncate">
                    {competition.join_code}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-primary shrink-0">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied" : "Copy"}
                  </span>
                </button>
              )}

              <p className="text-sm text-muted-foreground">
                Anyone can join from the Challenges tab with this code.
              </p>

              <button
                onClick={shareInvite}
                className="w-full rounded-xl gradient-red text-primary-foreground font-medium py-3 flex items-center justify-center gap-2"
              >
                <Share2 size={16} /> Share invite
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompetitionPage;
