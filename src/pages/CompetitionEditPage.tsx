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
  { key: "members", label: "Point de présence", hint: "Par participant. C'est le seul terme qui récompense l'effectif." },
  { key: "posts", label: "Anecdote publiée", hint: "Ce qui pousse à raconter plutôt qu'à regarder." },
  { key: "likes", label: "Like reçu", hint: "La popularité brute d'une anecdote." },
  { key: "comments", label: "Commentaire reçu", hint: "Plus rare qu'un like, donc en général plus lourd." },
  { key: "shares", label: "Partage", hint: "Ce qui fait venir des gens de l'extérieur." },
  { key: "bonus", label: "Meilleure anecdote du jour", hint: "Le bonus du vote, versé au dépouillement de 4 h." },
];

const CompetitionEditPage = () => {
  const { competitionId } = useParams<{ competitionId: string }>();
  const editing = Boolean(competitionId);
  const navigate = useNavigate();
  const { create } = useCompetitions();
  const {
    competition, days: existingDays, teams: existingTeams, isOwner, canEditScoring,
    loading, setTheme, update, addTeam, renameTeam, removeTeam,
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
    if (!name.trim()) { toast.error("Il faut un nom."); return; }
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
        toast.success("Compétition mise à jour");
        navigate(`/competitions/${competitionId}`);
        return;
      }
      const kept = themes.map((t) => t.trim()).filter(Boolean);
      if (kept.length === 0) { toast.error("Il faut au moins un jour et son thème."); return; }
      const created = await create({
        name: name.trim(),
        description: description.trim() || undefined,
        prize: prize.trim() || undefined,
        visibility,
        startsOn: new Date(`${startsOn}T00:00:00`),
        template,
        teams: teams
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t, i) => ({ name: t, color: ["#e11d48", "#2563eb", "#16a34a", "#d97706"][i % 4] })),
        days: kept.map((theme, i) => ({ day_index: i + 1, theme })),
        scoring,
      });
      toast.success("Compétition créée !");
      navigate(`/competitions/${created.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  if (editing && !loading && !isOwner) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Lock size={32} className="text-muted-foreground" />
        <p className="text-foreground font-medium">Seul le créateur règle cette compétition</p>
        <button onClick={() => navigate(-1)} className="text-primary text-sm font-medium">Retour</button>
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
            {editing ? "Réglages" : "Nouvelle compétition"}
          </h1>
          <button onClick={save} disabled={saving} className="text-primary font-medium text-sm disabled:opacity-40">
            {saving ? "…" : "Enregistrer"}
          </button>
        </div>
      </header>

      <div className="px-4 pt-4 space-y-6">
        {!editing && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Partir d'un modèle
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
                    {t.default_days.length} jours · {t.uses_teams ? "en équipes" : "solo"}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-2.5">
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la compétition" />
          <input className={field} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Le lot — soirée bière/pizza…" />
          <textarea className={`${field} h-20 resize-none`} value={description}
                    onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          {!editing && (
            <input className={field} type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
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
                {v === "private" ? "Privée (sur code)" : "Publique"}
              </button>
            ))}
          </div>
        </section>


        {/* Le barème — les six coefficients, réglables tant que rien n'est joué. */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Sparkles size={12} /> Le barème
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
              ? "Le barème est gelé depuis le départ : le changer maintenant rebattrait rétroactivement tout le classement."
              : "Réglable jusqu'au départ. Après, il est gelé — un classement doté d'un lot ne se recalcule pas en cours de route."}
          </p>
        </section>

        {!editing && (
          <>
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Équipes — laisse vide pour jouer chacun pour soi
              </h2>
              <div className="space-y-2">
                {teams.map((team, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      className={field}
                      value={team}
                      onChange={(e) => setTeams(teams.map((t, j) => (j === i ? e.target.value : t)))}
                      placeholder={`Équipe ${i + 1}`}
                    />
                    <button onClick={() => setTeams(teams.filter((_, j) => j !== i))}
                            className="px-3 text-muted-foreground"><Trash2 size={16} /></button>
                  </div>
                ))}
                <button onClick={() => setTeams([...teams, ""])}
                        className="flex items-center gap-1.5 text-sm text-primary font-medium">
                  <Plus size={15} /> Ajouter une équipe
                </button>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Un thème par jour — la durée, c'est leur nombre
              </h2>
              <div className="space-y-2">
                {themes.map((theme, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                    <input
                      className={field}
                      value={theme}
                      onChange={(e) => setThemes(themes.map((t, j) => (j === i ? e.target.value : t)))}
                      placeholder="Thème du jour"
                    />
                    <button onClick={() => setThemes(themes.filter((_, j) => j !== i))}
                            className="px-1 text-muted-foreground"><Trash2 size={16} /></button>
                  </div>
                ))}
                <button onClick={() => setThemes([...themes, ""])}
                        className="flex items-center gap-1.5 text-sm text-primary font-medium">
                  <Plus size={15} /> Ajouter un jour
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
              Les équipes
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
                      try { await renameTeam(team.id, value); toast.success("Équipe renommée"); }
                      catch (err) {
                        e.target.value = team.name;
                        toast.error(err instanceof Error ? err.message : "Refusé");
                      }
                    }}
                  />
                  <button
                    onClick={async () => {
                      // La conséquence réelle, annoncée avant : `team_id` est
                      // ON DELETE SET NULL, donc personne n'est supprimé — ses
                      // joueurs repassent en solo, avec leurs points.
                      const ok = window.confirm(
                        `Supprimer « ${team.name} » ? Ses joueurs repassent en solo et gardent leurs points.`
                      );
                      if (!ok) return;
                      try { await removeTeam(team.id); toast.success("Équipe supprimée"); }
                      catch (err) { toast.error(err instanceof Error ? err.message : "Refusé"); }
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
                  placeholder="Ajouter une équipe"
                />
                <button
                  onClick={async () => {
                    if (!newTeam.trim()) return;
                    try {
                      const palette = ["#e11d48", "#2563eb", "#16a34a", "#d97706"];
                      await addTeam(newTeam, palette[existingTeams.length % palette.length]);
                      setNewTeam("");
                      toast.success("Équipe ajoutée");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Refusé");
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
                Sans équipe, chacun joue pour soi et seul le classement des
                joueurs désigne le vainqueur.
              </p>
            )}
          </section>
        )}

        {editing && existingDays.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Les thèmes
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
                        try { await setTheme(day.id, e.target.value); toast.success("Thème mis à jour"); }
                        catch (err) { toast.error(err instanceof Error ? err.message : "Refusé"); }
                      }}
                    />
                    {!open && <Lock size={14} className="text-muted-foreground shrink-0" />}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Un jour commencé ne se réécrit plus : les anecdotes déjà publiées
              l'ont été sous ce thème-là.
            </p>
          </section>
        )}
      </div>
    </div>
  );
};

export default CompetitionEditPage;
