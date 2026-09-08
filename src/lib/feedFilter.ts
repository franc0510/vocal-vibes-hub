import { newestFirst } from "./feedOrder";

/**
 * Qui apparaît dans un feed, et pourquoi le filtrer ne suffit pas.
 *
 * LE BUG QUE CE FICHIER EXISTE POUR RÉGLER.
 *
 * `useVoicePosts` charge tout le feed, l'ordonne, puis n'en EXPOSE que les
 * cinq premiers — le reste se révèle au fil du défilement. `RealsViewer`
 * filtrait ces cinq-là. Autrement dit, l'onglet « Group » ne montrait une
 * anecdote de groupe que si elle tombait par hasard dans les cinq premières de
 * l'ordre GLOBAL, toutes anecdotes publiques confondues.
 *
 * Pire, c'était sans issue : la suite ne se charge que lorsqu'on approche de
 * la fin de la liste affichée, et une liste vide n'a pas de fin. On publiait
 * dans un groupe, on ouvrait l'onglet, on ne voyait rien, et rien ne pouvait
 * jamais arriver.
 *
 * Le commentaire de `revealAll` décrivait déjà exactement ce défaut… pour les
 * profils, seul cas où il avait été appliqué. Les groupes et les amis ont
 * gardé le bug.
 *
 * D'où `narrowsFeed` : un feed restreint est un ensemble FINI et connu, il se
 * charge en entier. Seul le feed sans filtre — celui qui n'a pas de fin —
 * garde la révélation par paquets de cinq.
 */

/** Ce que le feed a besoin de savoir d'une anecdote pour la trier. */
export interface FilterablePost {
  user_id: string;
  group_id?: string | null;
  created_at: string;
}

export interface FeedFilter {
  /** Les anecdotes d'un seul auteur — on arrive depuis son profil. */
  filterUserId?: string;
  /** Celles d'un groupe précis. */
  filterGroupId?: string;
  /** Celles de tous mes groupes, mêlées. */
  filterAllGroups?: boolean;
  /** Celles des gens que je suis. */
  filterFriends?: boolean;
}

/**
 * Ce filtre restreint-il le feed à un sous-ensemble fini ?
 *
 * Si oui, l'appelant doit charger la liste ENTIÈRE avant de filtrer. C'est la
 * réponse à la question « pourquoi mon anecdote de groupe n'apparaît pas » :
 * elle est bien là, simplement pas dans les cinq premières du feed global.
 */
export const narrowsFeed = (f: FeedFilter): boolean =>
  Boolean(f.filterUserId || f.filterGroupId || f.filterAllGroups || f.filterFriends);

/**
 * Les anecdotes que ce feed doit montrer.
 *
 * À appliquer sur la liste COMPLÈTE dès que `narrowsFeed` dit vrai — filtrer
 * une fenêtre de cinq est précisément ce qui vidait l'onglet des groupes.
 */
export const selectFeed = <T extends FilterablePost>(
  posts: readonly T[],
  filter: FeedFilter,
  friendIds: readonly string[] = []
): T[] => {
  const { filterUserId, filterGroupId, filterAllGroups, filterFriends } = filter;

  // Un profil se lit dans l'ordre où sa grille l'affiche : du plus récent au
  // plus ancien. L'ordre du feed — illustrées d'abord, puis paliers
  // d'engagement, mélangés — a du sens pour découvrir, mais il laissait le
  // lecteur sur une autre anecdote que la vignette qu'il venait de toucher.
  //
  // Les anecdotes de groupe restent hors du profil : elles appartiennent à
  // leur groupe, pas à la vitrine publique de leur auteur.
  if (filterUserId) {
    return newestFirst(posts.filter((p) => p.user_id === filterUserId && !p.group_id));
  }

  if (filterGroupId) {
    return posts.filter((p) => p.group_id === filterGroupId);
  }

  if (filterAllGroups) {
    return posts.filter((p) => Boolean(p.group_id));
  }

  if (filterFriends) {
    // Tel quel, y compris les anecdotes de groupe des gens qu'on suit : c'est
    // ce que faisait l'écran, et le corriger ici mêlerait un changement de
    // comportement à une correction de bug. À rediscuter — un dépôt dans un
    // groupe apparaît ainsi à deux endroits.
    return posts.filter((p) => friendIds.includes(p.user_id));
  }

  // « For you » : le tout-venant public, sans ce qui appartient à un groupe.
  return posts.filter((p) => !p.group_id);
};
