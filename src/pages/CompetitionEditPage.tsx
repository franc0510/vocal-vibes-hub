import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Lock, Plus, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useCompetitions } from "@/hooks/useCompetitions";
import { useCompetition } from "@/hooks/useCompetition";
import { TEMPLATES, type CompetitionTemplate } from "@/lib/competitionTemplates";
import {
  canEditDay, DEFAULT_WEIGHTS, weightsFrom, type ScoringWeights,
} from "@/lib/competitionScoring";
import { competitionDate, DEFAULT_TIMEZONE } from "@/lib/competitionClock";

/**
 * Créer une compétition, ou la régler quand on en est le propriétaire.
 *
 * Le même écran sert les deux : ce qui change, c'est qu'en édition les jours
 * déjà commencés sont en lecture seule. Un créateur qui réécrit le thème
 * d'hier réécrit l'histoire d'une compétition dotée d'un lot, et invalide les
 * anecdotes déjà publiées sous l'ancien.
 */

const field =
  "w-full bg-card border border-border/40 rounded-xl px-4 py-2.5 text-foreground text-sm placeholder:text-muted-foreground";

/**
 * Le barème, en toutes lettres.
 *
 * Les coefficients étaient en base depuis le début, lus à l'identique par la
 * vue SQL et par le module de score, mais aucun écran ne les montrait : ils ne
 * se réglaient qu'en éditant du JSON. Les voici, avec la phrase qui dit ce que
 * chacun récompense — un organisateur qui arbitre entre « volume » et
 * « qualité » a besoin de savoir lequel des six curseurs le fait.
 */
const SCORING_FIELDS: { key: keyof ScoringWeights; label: string; hint: string }[] = [
  { key: "members", label: "Turnout point", hint: "Per player. The only term that rewards team size." },
  { key: "posts", label: "Story posted", hint: "What pushes people to tell rather than watch." },
  { key: "likes", label: "Like received", hint: "Raw popularity of a story." },
  { key: "comments", label: "Comment received", hint: "Rarer than a like, so usually worth more." },
  { key: "shares", label: "Share", hint: "What brings people in from outside." },
  { key: "bonus", label: "Best story of the day", hint: "The vote bonus, paid out when votes are counted at 4am." },
];

const CompetitionEditPage = () => {
  const { competitionId } = useParams<{ competitionId: string }>();
  const editing = Boolean(competitionId);
  const navigate = useNavigate();
  const { create } = useCompetitions();
  const {
    competition, days: existingDays, teams: existingTeams, isOwner, canEditScoring,
    loading, setTheme, update, addDay, addTeam, renameTeam, removeTeam,
  } = useCompetition(competitionId);

  /** La date de référence de l'écran, dans le fuseau de la compétition. */
  const today = competitionDate(
    new Date(),
    competition?.timezone ?? DEFAULT_TIMEZONE
  );

  const [template, setTemplate] = useState<CompetitionTemplate | null>(null);
  const [name, setName] = useState("");
  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [startsOn, setStartsOn] = useState(competitionDate(new Date(), DEFAULT_TIMEZONE));
  const [scoring, setScoring] = useState<ScoringWeights>(DEFAULT_WEIGHTS);
  const [newTeam, setNewTeam] = useState("");
  const [newDay, setNewDay] = useState("");
  const [themes, setThemes] = useState<string[]>([""]);
  const [teams, setTeams] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Choisir un modèle remplit les champs : ils restent tous modifiables, le
  // modèle est un point de départ et non un lien permanent.
  const pickTemplate = (t: CompetitionTemplate | null) => {
    setTemplate(t);
    if (!t) return;
    setName((current) => current || t.name);
    setDescription(t.description);
    setThemes(t.default_days.map((d) => d.theme));
    setTeams(t.uses_teams ? t.default_teams.map((team) => team.name) : []);
    // Le barème du modèle est un point de départ, pas un lien : il atterrit
    // dans les champs, où il reste modifiable.
    setScoring(weightsFrom(t.default_scoring));
  };

  useEffect(() => {
    if (!competition) return;
    setName(competition.name);
    setPrize(competition.prize ?? "");
    setDescription(competition.description ?? "");
    setVisibility(competition.visibility);
    setStartsOn(competition.starts_on);
    setScoring(weightsFrom(competition.scoring));
  }, [competition]);

  const save = async () => {
    if (!name.trim()) { toast.error("It needs a name."); return; }
    setSaving(true);
    try {
      if (editing) {
        await update({
          name,
          prize: prize || null,
          description: description || null,
          visibility,
          // Gelé après le départ : changer un coefficient en cours de route
          // rebat rétroactivement tout un classement doté d'un lot. La base
          // applique la même règle, par trigger.
          ...(canEditScoring ? { scoring } : {}),
        });
        toast.success("Challenge updated");
        navigate(`/competitions/${competitionId}`);
        return;
      }
      const kept = themes.map((t) => t.trim()).filter(Boolean);
      if (kept.length === 0) { toast.error("It needs at least one day and its theme."); return; }
      const created = await create({
        name: name.trim(),
        description: description.trim() || undefined,
        prize: prize.trim() || undefined,
        visibility,
        startsOn,
        template,
        teams: teams
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t, i) => ({ name: t, color: ["#e11d48", "#2563eb", "#16a34a", "#d97706"][i % 4] })),
        days: kept.map((theme, i) => ({ day_index: i + 1, theme })),
        scoring,
      });
      toast.success("Challenge created!");
      navigate(`/competitions/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (editing && !loading && !isOwner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Lock size={32} className="text-muted-foreground" />
        <p className="text-foreground font-medium">Only the creator can set up this challenge</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm font-medium">Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border/40"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="flex items-center gap-2 px-3 py-3">
          <button onClick={() => navigate(-1)} className="p-1 text-foreground"><ChevronLeft size={22} /></button>
          <h1 className="flex-1 font-bold text-foreground">
            {editing ? "Settings" : "New challenge"}
          </h1>
          <button onClick={save} disabled={saving} className="text-primary font-medium text-sm disabled:opacity-40">
            {saving ? "…" : "Save"}
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {!editing && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Start from a template
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => pickTemplate(template?.key === t.key ? null : t)}
                  className={`text-left p-3 rounded-xl border ${
                    template?.key === t.key ? "border-primary bg-primary/10" : "border-border/40 bg-card"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t.default_days.length} days · {t.uses_teams ? "teams" : "solo"}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2.5">
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Challenge name" />
          <input className={field} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="The prize — beer and pizza night…" />
          <textarea className={`${field} h-20 resize-none`} value={description}
                    onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          {/* `min` : un jour déjà commencé est refusé par la base, autant ne pas
              le proposer. Aujourd'hui reste choisissable — c'est le cas le plus
              courant, et c'est précisément celui qui était cassé. */}
          {!editing && (
            <input
              className={field}
              type="date"
              value={startsOn}
              min={competitionDate(new Date(), DEFAULT_TIMEZONE)}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            {(["private", "public"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border ${
                  visibility === v ? "border-primary text-primary bg-primary/10" : "border-border/40 text-muted-foreground"
                }`}
              >
                {v === "private" ? "Private (code only)" : "Public"}
              </button>
            ))}
          </div>
        </section>


        {/* Le barème — les six coefficients, réglables tant que rien n'est joué. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles size={12} /> Scoring
            {editing && !canEditScoring && <Lock size={12} className="shrink-0" />}
          </h2>
          <div className="space-y-2">
            {SCORING_FIELDS.map(({ key, label, hint }) => {
              const open = !editing || canEditScoring;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>
                  </div>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={scoring[key]}
                    readOnly={!open}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setScoring((current) => ({
                        ...current,
                        // Un champ vidé rend NaN : on retombe sur zéro plutôt
                        // que d'écrire un barème illisible en base.
                        [key]: Number.isFinite(value) ? value : 0,
                      }));
                    }}
                    className={`w-16 shrink-0 bg-card border border-border/40 rounded-xl px-2 py-2 text-foreground text-sm text-center tabular-nums ${
                      open ? "" : "opacity-50"
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {editing && !canEditScoring
              ? "Scoring is frozen since the challenge started — changing it now would retroactively reshuffle every standing."
              : "Adjustable until the start. After that it is frozen — standings with a prize on the line are not recomputed mid-run."}
          </p>
        </section>

        {!editing && (
          <>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Teams — leave empty for everyone-for-themselves
              </h2>
              <div className="space-y-2">
                {teams.map((team, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={field}
                      value={team}
                      onChange={(e) => setTeams(teams.map((t, j) => (j === i ? e.target.value : t)))}
                      placeholder={`Team ${i + 1}`}
                    />
                    <button onClick={() => setTeams(teams.filter((_, j) => j !== i))}
                            className="px-3 text-muted-foreground"><Trash2 size={16} /></button>
                  </div>
                ))}
                <button onClick={() => setTeams([...teams, ""])}
                        className="flex items-center gap-1.5 text-sm text-primary font-medium">
                  <Plus size={15} /> Add a team
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                One theme per day — the number of days is the length
              </h2>
              <div className="space-y-2">
                {themes.map((theme, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                    <input
                      className={field}
                      value={theme}
                      onChange={(e) => setThemes(themes.map((t, j) => (j === i ? e.target.value : t)))}
                      placeholder="Theme of the day"
                    />
                    <button onClick={() => setThemes(themes.filter((_, j) => j !== i))}
                            className="px-1 text-muted-foreground"><Trash2 size={16} /></button>
                  </div>
                ))}
                <button onClick={() => setThemes([...themes, ""])}
                        className="flex items-center gap-1.5 text-sm text-primary font-medium">
                  <Plus size={15} /> Add a day
                </button>
              </div>
            </section>
          </>
        )}


        {/* ⑥ Les équipes après création : elles n'étaient réglables qu'au
            moment de créer, et une faute de frappe obligeait à tout refaire. */}
        {editing && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Teams
            </h2>
            <div className="space-y-2">
              {existingTeams.map((team) => (
                <div key={team.id} className="flex gap-2 items-center">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: team.color ?? "hsl(var(--muted-foreground))" }}
                  />
                  <input
                    className={field}
                    defaultValue={team.name}
                    onBlur={async (e) => {
                      const value = e.target.value.trim();
                      if (!value || value === team.name) { e.target.value = team.name; return; }
                      try { await renameTeam(team.id, value); toast.success("Team renamed"); }
                      catch (err) {
                        e.target.value = team.name;
                        toast.error(err instanceof Error ? err.message : "Refused");
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      // La conséquence réelle, annoncée avant : `team_id` est
                      // ON DELETE SET NULL, donc personne n'est supprimé — ses
                      // joueurs repassent en solo, avec leurs points.
                      const ok = window.confirm(
                        `Remove "${team.name}"? Its players go solo and keep their points.`
                      );
                      if (!ok) return;
                      try { await removeTeam(team.id); toast.success("Team removed"); }
                      catch (err) { toast.error(err instanceof Error ? err.message : "Refused"); }
                    }}
                    className="px-3 text-muted-foreground shrink-0"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <input
                  className={field}
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  placeholder="Add a team"
                />
                <button
                  onClick={async () => {
                    if (!newTeam.trim()) return;
                    try {
                      const palette = ["#e11d48", "#2563eb", "#16a34a", "#d97706"];
                      await addTeam(newTeam, palette[existingTeams.length % palette.length]);
                      setNewTeam("");
                      toast.success("Team added");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Refused");
                    }
                  }}
                  disabled={!newTeam.trim()}
                  className="px-3 shrink-0 text-primary disabled:opacity-40"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
            {existingTeams.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                With no teams, everyone plays for themselves and the player
                standings alone decide the winner.
              </p>
            )}
          </section>
        )}

        {editing && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Themes
            </h2>
            <div className="space-y-2">
              {existingDays.map((day) => {
                const open = canEditDay(day.date, today);
                return (
                  <div key={day.id} className="flex gap-2 items-center">
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground">{day.day_index}</span>
                    <input
                      className={`${field} ${open ? "" : "opacity-50"}`}
                      defaultValue={day.theme}
                      readOnly={!open}
                      onBlur={async (e) => {
                        if (!open || e.target.value === day.theme) return;
                        try { await setTheme(day.id, e.target.value); toast.success("Theme updated"); }
                        catch (err) { toast.error(err instanceof Error ? err.message : "Refused"); }
                      }}
                    />
                    {!open && <Lock size={14} className="text-muted-foreground shrink-0" />}
                  </div>
                );
              })}
            </div>
            {/*
              Ajouter un jour : sans ce champ, une compétition dont les jours
              avaient échoué à la création restait vide pour toujours, et le
              seul recours était de tout recréer.
            */}
            <div className="flex gap-2 mt-2">
              <span className="w-5 shrink-0" />
              <input
                className={field}
                value={newDay}
                onChange={(e) => setNewDay(e.target.value)}
                placeholder="Add a day — its theme"
              />
              <button
                onClick={async () => {
                  if (!newDay.trim()) return;
                  try {
                    // Le lendemain du dernier jour, ou demain si la liste est
                    // vide : un jour déjà commencé serait refusé par la base.
                    const last = existingDays.reduce(
                      (max, d) => (d.date > max ? d.date : max),
                      today
                    );
                    const next = new Date(`${last}T00:00:00Z`);
                    next.setUTCDate(next.getUTCDate() + 1);
                    await addDay(newDay, next.toISOString().slice(0, 10));
                    setNewDay("");
                    toast.success("Day added");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Refused");
                  }
                }}
                disabled={!newDay.trim()}
                className="px-3 shrink-0 text-primary disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </div>

            <p className="text-[11px] text-muted-foreground mt-2">
              A day that has started can no longer be rewritten — the stories
              already posted were posted under that theme.
            </p>
          </section>
        )}
      </div>
    </div>
  );
};

export default CompetitionEditPage;
