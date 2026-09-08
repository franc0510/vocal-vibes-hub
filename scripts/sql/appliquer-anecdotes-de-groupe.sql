-- ============================================================
--  VocMe — les anecdotes de groupe restent dans leur groupe
-- ============================================================
--
--  À COLLER DANS : tableau de bord Supabase → SQL Editor → Run
--
--  Ce fichier reprend la migration :
--    supabase/migrations/20260908200000_group_posts_stay_in_their_group.sql
--
--  CE QU'IL CORRIGE, et qui est une fuite de confidentialité bien réelle :
--  `voice_posts` porte DEUX politiques de lecture, et Postgres combine les
--  politiques permissives par un OU. La plus ancienne accorde la lecture à
--  toute ligne dont `visibility` vaut 'public' — or la colonne est NOT NULL
--  DEFAULT 'public' et l'application ne l'écrivait nulle part. Résultat :
--  TOUTE ANECDOTE DÉPOSÉE SUR UN GROUPE EST AUJOURD'HUI LISIBLE PAR
--  N'IMPORTE QUI.
--
--  Il les remplace par une politique unique, aux branches exclusives.
--
--  Idempotent : il se relance sans rien casser ni rien perdre. Rejoué de zéro
--  contre un vrai Postgres, avec les assertions de lecture des groupes.
--
--  À PASSER APRÈS appliquer-groupes-codes.sql.
-- ============================================================

-- ============================================================
-- Une anecdote déposée sur un groupe y reste.
--
-- Ce qu'on croyait acquis depuis la migration des groupes ne l'a jamais été.
-- `voice_posts` porte DEUX politiques de lecture, et Postgres combine les
-- politiques permissives avec un OU :
--
--   « View voice posts based on visibility »  (20260305121906)
--       visibility = 'public' OR auteur OR abonné
--   « Users can view voice posts »            (20260324100000, les groupes)
--       group_id IS NULL OR membre du groupe OR auteur
--
-- La seconde voulait restreindre ; la première suffit à tout ouvrir. Elle
-- accorde en effet la lecture à toute ligne dont `visibility` vaut 'public' —
-- or la colonne est NOT NULL DEFAULT 'public', et l'application ne l'écrit
-- nulle part. Autrement dit :
--
--   TOUTES LES ANECDOTES DE GROUPE SONT LISIBLES PAR N'IMPORTE QUI.
--
-- La migration des groupes avait bien tenté de faire le ménage, mais elle
-- supprimait « Anyone can view voice posts » — le nom d'AVANT — sans connaître
-- celui qui l'avait remplacée trois semaines plus tôt. Le `DROP POLICY IF
-- EXISTS` n'a rien trouvé, n'a rien dit, et les deux politiques cohabitent
-- depuis.
--
-- On les remplace par UNE SEULE, qui dit les deux règles au lieu de les
-- superposer. Les branches sont exclusives, faute de quoi on retomberait dans
-- le même OU permissif.
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view voice posts" ON public.voice_posts;
DROP POLICY IF EXISTS "View voice posts based on visibility" ON public.voice_posts;
DROP POLICY IF EXISTS "Users can view voice posts" ON public.voice_posts;

CREATE POLICY "Users can view voice posts" ON public.voice_posts
FOR SELECT USING (
  -- On voit toujours ce qu'on a publié soi-même.
  auth.uid() = user_id

  -- Déposée sur un groupe : ses membres, et personne d'autre. Ni les abonnés
  -- de l'auteur, ni le tout-venant.
  OR (
    group_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.group_members m
       WHERE m.group_id = voice_posts.group_id
         AND m.user_id = auth.uid()
    )
  )

  -- Hors groupe : la règle de visibilité d'origine, inchangée.
  --
  -- `group_id IS NULL` n'est pas une précaution de style : sans lui, cette
  -- branche rouvrirait aux abonnés — et à tous, via 'public' — ce que la
  -- précédente vient de réserver aux membres.
  OR (
    group_id IS NULL
    AND (
      visibility = 'public'
      OR EXISTS (
        SELECT 1 FROM public.follows f
         WHERE f.follower_id = auth.uid()
           AND f.following_id = voice_posts.user_id
      )
    )
  )
);

-- Une note sur la suppression d'un groupe.
--
-- `voice_posts.group_id` est en ON DELETE SET NULL : supprimer un groupe
-- délie ses anecdotes. Elles retombent alors sur la branche « hors groupe »
-- avec la visibilité qu'on leur a écrite. C'est pourquoi l'application écrit
-- désormais 'group' dans `visibility` pour un dépôt de groupe : cette valeur
-- ne vaut ni 'public' ni un abonnement, si bien qu'une anecdote de groupe
-- devient privée à son auteur plutôt que publique le jour où le groupe
-- disparaît. Le contraire — publier au monde entier ce qui avait été confié à
-- six personnes — serait le pire des défauts silencieux.
