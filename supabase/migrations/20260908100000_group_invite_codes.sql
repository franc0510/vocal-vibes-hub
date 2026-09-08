-- ============================================================
-- Un groupe se rejoint, il ne se subit pas.
--
-- Jusqu'ici, entrer dans un groupe n'avait qu'un chemin : que son
-- propriétaire vous y mette, et seulement s'il vous suivait déjà. Autrement
-- dit, personne ne pouvait rejoindre un groupe de lui-même, et le
-- propriétaire ne pouvait pas inviter quelqu'un qu'il ne suivait pas encore.
--
-- Les compétitions ont résolu exactement ce problème : un code court qu'on
-- dicte au téléphone, un lien qu'on colle dans une conversation. On reprend
-- la même mécanique, avec le même alphabet, parce que c'est la même promesse.
--
--   CONNAÎTRE LE CODE EST LA PREUVE DE L'INVITATION.
--
-- Cette phrase n'est vraie qu'à deux conditions, et TOUTES DEUX manquaient :
--
--   1. Le code doit être un secret. Or `groups` se lisait avec
--      « USING (true) » : n'importe qui pouvait lire tous les groupes, donc
--      tous les codes. Un sésame affiché sur la porte n'en est pas un.
--   2. Il ne doit pas exister de chemin qui s'en passe. Or la politique
--      d'insertion de `group_members` disait « OR auth.uid() = user_id » :
--      n'importe qui pouvait s'ajouter à N'IMPORTE QUEL groupe en connaissant
--      son identifiant — et donc lire les anecdotes qui y sont publiées, dont
--      la politique de lecture ne demande rien de plus que d'être membre.
--
-- Les deux se referment ici. L'entrée par soi-même passe désormais par
-- `join_group_with_code`, qui exige le code ; l'ajout direct reste réservé au
-- propriétaire, comme avant.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Le code
-- ------------------------------------------------------------

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS join_code TEXT;

-- En index plutôt qu'en contrainte : `CREATE UNIQUE INDEX IF NOT EXISTS` se
-- rejoue sans erreur, ce qu'un `ADD CONSTRAINT` ne sait pas faire. Les NULL
-- restent multiples, le temps que le remplissage plus bas les efface.
CREATE UNIQUE INDEX IF NOT EXISTS groups_join_code_key
  ON public.groups (join_code);

/**
 * Un code court, lisible au téléphone : ni 0/O ni 1/I.
 *
 * Jumeau de `make_join_code()` (compétitions) et de `makeJoinCode()` côté
 * client, avec le même alphabet — un code se dicte, et « zéro ou O ? » est la
 * question qu'on ne veut jamais entendre.
 */
CREATE OR REPLACE FUNCTION public.make_group_join_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i INTEGER;
BEGIN
  -- L'index est UNIQUE : on retente plutôt que d'échouer sur une collision,
  -- très improbable mais pas impossible.
  FOR attempt IN 1..20 LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.groups WHERE join_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

/**
 * Tout groupe naît avec son code.
 *
 * En trigger et non dans le client, pour la raison qui vaut partout ailleurs :
 * un code posé à trois endroits est un code oublié à un quatrième.
 */
CREATE OR REPLACE FUNCTION public.ensure_group_join_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := public.make_group_join_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_group_join_code_trigger ON public.groups;
CREATE TRIGGER ensure_group_join_code_trigger
  BEFORE INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_group_join_code();

-- Les groupes déjà créés en reçoivent un, un par un, la fonction relisant la
-- table pour éviter les collisions.
DO $$
DECLARE
  g RECORD;
BEGIN
  FOR g IN SELECT id FROM public.groups WHERE join_code IS NULL LOOP
    UPDATE public.groups SET join_code = public.make_group_join_code() WHERE id = g.id;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) Le code redevient un secret
-- ------------------------------------------------------------

-- « Anyone can view groups » rendait publics le nom, le propriétaire ET le
-- code de chaque groupe. RLS travaille par ligne et non par colonne : il n'y a
-- pas moyen de montrer la ligne en cachant la seule colonne qui compte. On
-- restreint donc la ligne à ceux qu'elle regarde — ce que l'application faisait
-- déjà d'elle-même, en ne lisant que les groupes dont on est.
--
-- L'invité, lui, ne lit pas la table : il passe par `group_invite_preview`,
-- juste en dessous.
DROP POLICY IF EXISTS "Anyone can view groups" ON public.groups;
DROP POLICY IF EXISTS "Members can view groups" ON public.groups;
CREATE POLICY "Members can view groups" ON public.groups
  FOR SELECT USING (
    auth.uid() = owner_id
    OR EXISTS (
      SELECT 1 FROM public.group_members m
       WHERE m.group_id = groups.id AND m.user_id = auth.uid()
    )
  );

-- On n'entre plus dans un groupe par la seule connaissance de son
-- identifiant. Le propriétaire ajoute qui il veut ; tous les autres passent
-- par le code, donc par `join_group_with_code`.
DROP POLICY IF EXISTS "Group owners can add members" ON public.group_members;
CREATE POLICY "Group owners can add members" ON public.group_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND owner_id = auth.uid())
  );

-- La sortie reste libre : on quitte un groupe sans demander la permission.
-- (Politique inchangée, redéclarée ici pour que la migration se lise seule.)
DROP POLICY IF EXISTS "Group owners can remove members" ON public.group_members;
CREATE POLICY "Group owners can remove members" ON public.group_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND owner_id = auth.uid())
    OR auth.uid() = user_id
  );

-- ------------------------------------------------------------
-- 3) L'invitation, qui se lit avant d'être acceptée
-- ------------------------------------------------------------

/**
 * Ce qu'un lien d'invitation montre : de quoi décider si l'on entre.
 *
 * `anon` y a droit, et c'est tout l'intérêt : celui qui reçoit le lien n'a
 * pas encore de compte. Lui demander de s'inscrire pour découvrir à quoi on
 * l'invite, c'est perdre la moitié des invités sur l'écran de connexion.
 *
 * Ce qu'on ne révèle pas : la liste des membres, et les anecdotes du groupe.
 * Seulement le nom, qui invite, et combien ils sont.
 */
CREATE OR REPLACE FUNCTION public.group_invite_preview(code TEXT)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g public.groups;
  owner_profile RECORD;
  wanted TEXT := upper(btrim(coalesce(code, '')));
BEGIN
  -- Un code vide ne doit pas ramener le premier groupe venu.
  IF wanted = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO g FROM public.groups WHERE join_code = wanted;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT display_name, username, avatar_url INTO owner_profile
    FROM public.profiles WHERE id = g.owner_id;

  RETURN jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'created_at', g.created_at,
    'member_count', (SELECT count(*) FROM public.group_members m WHERE m.group_id = g.id),
    -- Qui invite : un nom rassure là où un identifiant inquiète.
    'owner_name', owner_profile.display_name,
    'owner_username', owner_profile.username,
    'owner_avatar_url', owner_profile.avatar_url,
    -- Pour que l'écran sache proposer « rejoindre » ou « ouvrir ».
    'is_member', EXISTS (
      SELECT 1 FROM public.group_members m
       WHERE m.group_id = g.id AND m.user_id = auth.uid()
    ) OR g.owner_id = auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.group_invite_preview(TEXT)
  TO anon, authenticated, service_role;

/**
 * Entrer dans un groupe par son code.
 *
 * SECURITY DEFINER parce que c'est désormais le SEUL chemin : la politique
 * d'insertion ne connaît que le propriétaire, et c'est cette fonction qui
 * vérifie ce que RLS ne peut pas vérifier — la détention du code.
 *
 * Idempotente : recliquer sur le lien qu'on a déjà accepté ouvre le groupe, ça
 * n'est pas une erreur. Un code inconnu rend NULL plutôt que de lever, pour
 * que l'écran dise « aucun groupe avec ce code » et non « une erreur est
 * survenue ».
 */
CREATE OR REPLACE FUNCTION public.join_group_with_code(code TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  g public.groups;
  wanted TEXT := upper(btrim(coalesce(code, '')));
  me UUID := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to join a group.'
      USING ERRCODE = '28000';
  END IF;

  IF wanted = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO g FROM public.groups WHERE join_code = wanted;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (g.id, me)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('id', g.id, 'name', g.name);
END;
$$;

-- Pas `anon` : on ne rejoint rien sans compte. L'écran d'invitation retient le
-- code, fait passer par l'inscription, et revient ici.
GRANT EXECUTE ON FUNCTION public.join_group_with_code(TEXT)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 4) « Untel vous a ajouté » n'est pas ce qui vient d'arriver
-- ------------------------------------------------------------

/**
 * La notification d'ajout ne concerne plus celui qui est entré tout seul.
 *
 * Le trigger annonçait « le propriétaire vous a ajouté au groupe » à chaque
 * nouvelle ligne. Depuis qu'on peut entrer par un lien, ça se déclenche sur
 * son propre geste, et ça raconte quelque chose de faux : personne ne vous a
 * ajouté, vous venez d'accepter une invitation.
 */
CREATE OR REPLACE FUNCTION public.handle_group_member_notification()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  group_owner UUID;
BEGIN
  -- Entré de son propre chef, par le code ou par le lien : rien à annoncer.
  IF NEW.user_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  SELECT owner_id INTO group_owner FROM public.groups WHERE id = NEW.group_id;

  IF group_owner IS NOT NULL AND NEW.user_id != group_owner THEN
    INSERT INTO public.notifications (user_id, actor_id, type, group_id)
    VALUES (NEW.user_id, group_owner, 'group_added', NEW.group_id);
  END IF;

  RETURN NEW;
END;
$$;
