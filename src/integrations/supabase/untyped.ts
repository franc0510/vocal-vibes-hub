/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "./client";

/**
 * L'accès aux tables que `types.ts` ne connaît pas encore.
 *
 * `types.ts` est généré par la CLI Supabase depuis le schéma déployé : le
 * modifier à la main marcherait jusqu'à la prochaine régénération, qui
 * effacerait tout sans prévenir. Tant que les tables de compétition n'y sont
 * pas, il faut donc un accès non typé — et il vaut mieux qu'il soit nommé ici,
 * une fois, que dissous en `as any` dans chaque requête.
 *
 * Les lignes restent typées côté appelant : chaque hook déclare ses propres
 * interfaces et convertit ce qu'il reçoit. Ce qui se perd, c'est la
 * vérification des noms de colonnes — d'où les assertions RLS jouées contre un
 * vrai Postgres, qui, elles, ne peuvent pas se tromper de colonne en silence.
 *
 * À retirer dès que `npx supabase gen types` peut tourner contre le projet.
 */
export const db = supabase as any;
