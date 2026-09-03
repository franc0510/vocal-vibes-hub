/**
 * Les modèles de compétition.
 *
 * Un modèle est un point de départ, jamais un lien permanent : créer une
 * compétition à partir de lui **copie** ses valeurs, et tout reste modifiable
 * ensuite. C'est ce qui permet au défi inter-écoles de servir de premier client
 * du moteur sans en devenir la définition.
 *
 * Ils sont écrits ici mais vivent en base, poussés par
 * `scripts/seed-templates.ts`. La différence compte : en ajouter un ne demande
 * alors aucune publication sur l'App Store — c'est précisément ce que
 * « scalable » veut dire ici.
 */

import { addDays } from "./competitionClock";

export interface TemplateDay {
  day_index: number;
  theme: string;
}

export interface TemplateTeam {
  name: string;
  color: string;
}

export interface CompetitionTemplate {
  key: string;
  name: string;
  description: string;
  uses_teams: boolean;
  default_teams: TemplateTeam[];
  default_days: TemplateDay[];
  default_scoring: Record<string, number>;
  sort_order: number;
}

const days = (...themes: string[]): TemplateDay[] =>
  themes.map((theme, i) => ({ day_index: i + 1, theme }));

export const TEMPLATES: CompetitionTemplate[] = [
  {
    key: "inter-ecoles",
    name: "Défi inter-écoles",
    description:
      "Sept jours, un thème par jour, deux écoles ou plus. La gagnante remporte le lot.",
    uses_teams: true,
    // Laissées vides à dessein : les écoles changent à chaque défi, et
    // proposer « École A » et « École B » ferait retaper deux champs plutôt
    // qu'en remplir deux vides.
    default_teams: [],
    default_days: days(
      "Ton pire date",
      "Ta meilleure anecdote avec la police",
      "Ta meilleure anecdote de soirée",
      "Ton moment le plus honteux",
      "Ta meilleure anecdote coquine",
      "Ta meilleure blague",
      "Ta meilleure anecdote — carte joker"
    ),
    // Le décompte des membres est mis à 1 sur cinq points d'anecdote : avec
    // 800 étudiants contre 200, un poids plus fort ferait décider l'effectif
    // presque seul, avant même qu'on ait publié quoi que ce soit.
    default_scoring: { members: 1, posts: 5, likes: 1, comments: 2, shares: 3, bonus: 20 },
    sort_order: 1,
  },
  {
    key: "mariage",
    name: "Mariage",
    description:
      "Les invités racontent leurs souvenirs des mariés. Trois jours, deux camps.",
    uses_teams: true,
    default_teams: [
      { name: "Team mariée", color: "#e11d48" },
      { name: "Team marié", color: "#2563eb" },
    ],
    default_days: days(
      "Comment tu les as rencontrés",
      "L'anecdote qu'ils préféreraient qu'on oublie",
      "Ton vœu pour eux"
    ),
    // Un mariage compte cent invités, pas mille : le nombre de participants
    // n'y écrase rien, et ce sont les réactions qui font la soirée.
    default_scoring: { members: 1, posts: 5, likes: 2, comments: 3, shares: 2, bonus: 15 },
    sort_order: 2,
  },
  {
    key: "seminaire",
    name: "Séminaire d'entreprise",
    description:
      "Les services s'affrontent sur deux jours. De quoi briser la glace sans jeu de rôle.",
    uses_teams: true,
    default_teams: [],
    default_days: days(
      "Ton pire moment au bureau",
      "Ce que personne ne sait sur toi"
    ),
    default_scoring: { members: 1, posts: 5, likes: 1, comments: 2, shares: 1, bonus: 15 },
    sort_order: 3,
  },
  {
    key: "entre-amis",
    name: "Entre amis",
    description: "Pas d'équipes, chacun pour soi. Le meilleur conteur gagne.",
    uses_teams: false,
    default_teams: [],
    default_days: days(
      "Ta pire honte",
      "Ta meilleure soirée",
      "L'histoire que tu racontes toujours"
    ),
    // Sans équipe, le point de membre ne départage personne — tout le monde
    // l'a. Il est mis à zéro pour que le classement ne parle que du contenu.
    default_scoring: { members: 0, posts: 5, likes: 1, comments: 2, shares: 3, bonus: 20 },
    sort_order: 4,
  },
];

/**
 * Les valeurs qu'un modèle donne à la compétition qu'il amorce.
 *
 * `startsOn` est une date civile en `YYYY-MM-DD`, et non un `Date` : un jour de
 * défi n'a pas d'heure, et le faire passer par un instant le décalait d'un jour
 * dans tout fuseau à l'est de Greenwich.
 */
export function fromTemplate(template: CompetitionTemplate, startsOn: string) {
  const dayDate = (offset: number) => addDays(startsOn, offset);
  return {
    template_key: template.key,
    description: template.description,
    // Copiés, jamais partagés : un modèle est une origine, pas une dépendance.
    // Rendre l'objet du modèle ferait qu'ajuster les coefficients d'une
    // compétition les changerait pour toutes les suivantes.
    scoring: { ...template.default_scoring },
    // La durée n'est pas un réglage : c'est le nombre de jours du modèle.
    starts_on: dayDate(0),
    ends_on: dayDate(template.default_days.length - 1),
    days: template.default_days.map((d) => ({ ...d, date: dayDate(d.day_index - 1) })),
    teams: template.uses_teams ? template.default_teams.map((t) => ({ ...t })) : [],
  };
}
