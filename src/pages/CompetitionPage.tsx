import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft, Trophy, Users, Mic, Settings, Sparkles, Share2, Crown, Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetition } from "@/hooks/useCompetition";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useCompetitionScores } from "@/hooks/useCompetitionScores";

/**
 * Une compétition : le thème du jour, et les deux classements.
 *
 * Toujours les deux. Celui des équipes décide de la soirée ; celui des joueurs
 * fait le travail au quotidien — « je suis 4e de mon école » pousse à publier
 * bien plus qu'un total collectif où personne ne se reconnaît. Sans équipes,
 * seul le second existe, et il désigne le vainqueur.
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
    competition, teams, days, membership, currentDay,
    isOwner, isMember, isOver, loading, chooseTeam,
  } = useCompetition(competitionId);
  const { join } = useCompetitions();
  const { players, teams: teamScores, pending, final } = useCompetitionScores(competitionId);

  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [tab, setTab] = useState<"teams" | "players">("teams");
  const [onlyMyTeam, setOnlyMyTeam] = useState(false);

  // Sans équipes, l'onglet « équipes » n'aurait rien à montrer.
  useEffect(() => {
    if (teams.length === 0) setTab("players");
  }, [teams.length]);

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
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Chargement…</div>;
  }
  if (!competition) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Trophy size={36} className="text-muted-foreground" />
        <p className="text-foreground font-medium">Compétition introuvable</p>
        <p className="text-sm text-muted-foreground">
          Elle est peut-être privée : il faut une invitation ou son code.
        </p>
        <button onClick={() => navigate("/competitions")} className="mt-2 text-primary text-sm font-medium">
          Retour
        </button>
      </div>
    );
  }

  const shareCode = async () => {
    const text = competition.join_code
      ? `Rejoins « ${competition.name} » sur VocMe avec le code ${competition.join_code} !`
      : `Rejoins « ${competition.name} » sur VocMe !`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Invitation copiée");
      }
    } catch { /* partage annulé */ }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2 px-3 py-3">
          <button onClick={() => navigate("/competitions")} className="p-1 text-foreground">
            <ChevronLeft size={22} />
          </button>
          <h1 className="flex-1 font-bold text-foreground truncate">{competition.name}</h1>
          <button onClick={shareCode} className="p-1.5 text-foreground"><Share2 size={18} /></button>
          {isOwner && (
            <button onClick={() => navigate(`/competitions/${competition.id}/edit`)} className="p-1.5 text-foreground">
              <Settings size={18} />
            </button>
          )}
        </div>
      </header>

      <div className="px-4 pt-4 space-y-5">
        {/* Le thème du jour, et le bouton qui mène directement au micro. */}
        {currentDay ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className="rounded-2xl gradient-red p-4 text-primary-foreground">
            <p className="text-[11px] uppercase tracking-wide opacity-80">
              Jour {currentDay.day_index} · {daysLeft(competition.ends_on)} jour(s) restant(s)
            </p>
            <p className="text-lg font-bold mt-1 leading-snug">{currentDay.theme}</p>
            {isMember && (
              <button
                onClick={() => navigate(`/record?competitionDay=${currentDay.id}`)}
                className="mt-3 w-full bg-primary-foreground/15 backdrop-blur rounded-xl py-2.5 font-medium text-sm flex items-center justify-center gap-2"
              >
                <Mic size={16} /> Raconter la mienne
              </button>
            )}
          </motion.div>
        ) : (
          <div className="rounded-2xl bg-card border border-border/40 p-4">
            <p className="text-sm text-foreground font-medium">
              {isOver ? "Compétition terminée" : `Départ le ${competition.starts_on}`}
            </p>
            {competition.prize && (
              <p className="text-xs text-muted-foreground mt-1">🏆 {competition.prize}</p>
            )}
          </div>
        )}

        {!isMember && !isOver && (
          <button
            onClick={async () => {
              try {
                await join(competition.id);
                toast.success("Tu es dans la compétition !");
              } catch { toast.error("Impossible de rejoindre."); }
            }}
            className="w-full rounded-xl gradient-red text-primary-foreground font-medium py-3"
          >
            Rejoindre
          </button>
        )}

        {/* Choisir son camp — tant que rien n'est marqué. */}
        {isMember && teams.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Mon équipe
            </h2>
            <div className="flex flex-wrap gap-2">
              {teams.map((t) => {
                const chosen = membership?.team_id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={async () => {
                      try { await chooseTeam(t.id); }
                      catch (err) { toast.error(err instanceof Error ? err.message : "Refusé"); }
                    }}
                    className={`px-3.5 py-2 rounded-full text-sm font-medium border flex items-center gap-1.5 ${
                      chosen
                        ? "border-primary text-primary bg-primary/10"
                        : "border-border/50 text-muted-foreground"
                    }`}
                    style={chosen && t.color ? { borderColor: t.color, color: t.color } : undefined}
                  >
                    {chosen && <Check size={13} />}{t.name}
                  </button>
                );
              })}
            </div>
            {membership?.locked_at && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Ton équipe est verrouillée depuis ton premier point — c'est ce qui
                empêche de rejoindre celle qui mène la veille de la fin.
              </p>
            )}
          </section>
        )}

        {/* Les classements. */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Classement
            </h2>
            {!final && pending > 0 && (
              <span className="text-[11px] text-amber-400 flex items-center gap-1">
                <Sparkles size={11} /> + {pending} bonus à venir
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
                  {key === "teams" ? "Équipes" : "Joueurs"}
                </button>
              ))}
            </div>
          )}

          {tab === "teams" ? (
            <div className="space-y-1.5">
              {teamScores.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Rien de marqué pour l'instant.
                </p>
              )}
              {teamScores.map((t) => (
                <div key={t.team_id} className="flex items-center gap-3 bg-card border border-border/40 rounded-xl px-3 py-2.5">
                  <span className={`w-6 text-center font-bold ${t.rank === 1 ? "text-amber-400" : "text-muted-foreground"}`}>
                    {t.rank}
                  </span>
                  {t.rank === 1 && final && <Crown size={15} className="text-amber-400" />}
                  <span className="flex-1 font-medium text-foreground truncate">
                    {teamName.get(t.team_id ?? "") ?? "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Users size={11} />{t.members}
                  </span>
                  <span className="font-bold text-foreground tabular-nums">{t.score}</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              {membership?.team_id && (
                <button
                  onClick={() => setOnlyMyTeam((v) => !v)}
                  className={`text-[11px] mb-2 font-medium ${onlyMyTeam ? "text-primary" : "text-muted-foreground"}`}
                >
                  {onlyMyTeam ? "◉ Mon équipe seulement" : "○ Mon équipe seulement"}
                </button>
              )}
              <div className="space-y-1.5">
                {shownPlayers.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Rien de marqué pour l'instant.
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
                      <span className={`w-6 text-center font-bold ${p.rank === 1 ? "text-amber-400" : "text-muted-foreground"}`}>
                        {p.rank}
                      </span>
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full gradient-red flex items-center justify-center text-[10px] font-bold text-primary-foreground">
                          {(profile?.display_name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {profile?.display_name ?? "Anonyme"}
                        </p>
                        {p.team_id && !onlyMyTeam && (
                          <p className="text-[10px] text-muted-foreground truncate">
                            {teamName.get(p.team_id)}
                          </p>
                        )}
                      </div>
                      <span className="font-bold text-foreground tabular-nums">{p.score}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* Le programme, pour que personne ne découvre le thème le matin même. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Les {days.length} jours
          </h2>
          <div className="space-y-1">
            {days.map((d) => {
              const isToday = currentDay?.id === d.id;
              return (
                <div
                  key={d.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    isToday ? "bg-primary/10 border border-primary/40" : ""
                  }`}
                >
                  <span className="w-5 text-center text-xs font-bold text-muted-foreground">{d.day_index}</span>
                  <span className={`flex-1 text-sm ${isToday ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {d.theme}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CompetitionPage;
