-- ============================================================
--  VocMe — le moteur de compétitions
-- ============================================================
--
--  À COLLER DANS : tableau de bord Supabase → SQL Editor → Run
--
--  Ce fichier est la concaténation des deux migrations :
--    supabase/migrations/20260901100000_competitions.sql
--    supabase/migrations/20260901110000_competition_notification_types.sql
--
--  Il est idempotent : chaque ajout est conditionné à son absence, donc le
--  relancer ne casse rien et ne perd aucune donnée. Il a été rejoué deux fois
--  de suite contre un vrai Postgres, avec 13 assertions sur les règles d'accès.
--
--  Sans lui, l'onglet Défis s'ouvre sur des tables qui n'existent pas.
--
--  APRÈS L'AVOIR PASSÉ, il reste à poser les quatre modèles :
--    Actions → Lancer une compétition → Run workflow → « poser les modèles »
-- ============================================================

-- ============================================================
-- Moteur de compétitions.
--
-- Un défi inter-écoles, un mariage, un séminaire ou une bande de potes sont
-- la même mécanique : des gens, éventuellement des équipes, des jours à thème,
-- des points, un lot. Une seule idée porte la généralité du schéma :
--
--   UNE ÉQUIPE APPARTIENT À UNE COMPÉTITION, PAS À L'APPLICATION.
--
-- Une table globale « écoles » aurait servi le premier défi et rien d'autre :
-- un mariage n'a pas d'écoles, il a « team mariée » et « team marié ». En
-- attachant les équipes à la compétition, le même schéma sert les quatre cas
-- sans une ligne de plus.
-- ============================================================

-- 1) La compétition
--
--    La durée n'est pas un réglage : c'est le nombre de lignes dans
--    competition_days. Sept jours ou trois, aucune différence pour le code.
CREATE TABLE IF NOT EXISTS public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Ce que l'on gagne, en toutes lettres : « une soirée bière/pizza ».
  prize TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  -- Les jours se calculent dans le fuseau de l'organisateur, pas du téléphone.
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  -- Coefficients du score. En base et non dans le code : ils s'ajustent la
  -- veille d'un lancement, en voyant les effectifs réels, sans redéploiement.
  scoring JSONB NOT NULL DEFAULT
    '{"members":1,"posts":5,"likes":1,"comments":2,"shares":3,"bonus":20}'::jsonb,
  -- Sésame d'une compétition privée.
  join_code TEXT UNIQUE,
  template_key TEXT,
  -- Classement gelé à la clôture. Sans lui, un like posté trois semaines plus
  -- tard changerait rétroactivement le vainqueur d'une soirée déjà offerte.
  final_standings JSONB,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.competitions
    ADD CONSTRAINT competitions_visibility_check
    CHECK (visibility IN ('public', 'private'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.competitions
    ADD CONSTRAINT competitions_dates_check CHECK (ends_on >= starts_on);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Les équipes — autant qu'on veut, et zéro veut dire « chacun pour soi ».
CREATE TABLE IF NOT EXISTS public.competition_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, name)
);

-- 3) Les participants
--
--    locked_at fige l'équipe dès le premier point marqué : sans ça, on change
--    d'équipe en fin de parcours pour rejoindre celle qui gagne.
CREATE TABLE IF NOT EXISTS public.competition_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.competition_teams(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'member',
  locked_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, user_id)
);

CREATE INDEX IF NOT EXISTS competition_members_user_idx
  ON public.competition_members (user_id);

-- 4) Les jours et leurs thèmes
CREATE TABLE IF NOT EXISTS public.competition_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  day_index INTEGER NOT NULL,
  theme TEXT NOT NULL,
  date DATE NOT NULL,
  UNIQUE (competition_id, day_index),
  UNIQUE (competition_id, date)
);

-- 5) Le vote du jour — un par personne et par jour.
CREATE TABLE IF NOT EXISTS public.competition_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  day_id UUID NOT NULL REFERENCES public.competition_days(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.voice_posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (day_id, voter_id)
);

-- 6) Les invitations nommées, en plus du code de partage.
CREATE TABLE IF NOT EXISTS public.competition_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition_id, invited_user_id)
);

-- 7) Les modèles
--
--    En base et non dans le code : ajouter « Mariage » ou « Séminaire » ne
--    demande alors aucune publication sur l'App Store. Créer depuis un modèle
--    COPIE ses valeurs ; un modèle est un point de départ, jamais un lien.
CREATE TABLE IF NOT EXISTS public.competition_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  uses_teams BOOLEAN NOT NULL DEFAULT true,
  -- Les équipes proposées : « team mariée » et « team marié » pour un mariage,
  -- rien pour une compétition solo. Sans elles, un modèle turnkey obligerait
  -- quand même l'organisateur à tout retaper.
  default_teams JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_scoring JSONB NOT NULL DEFAULT
    '{"members":1,"posts":5,"likes":1,"comments":2,"shares":3,"bonus":20}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 8) Le lien avec les anecdotes
--
--    Le jour est stocké sur le post, pas déduit de created_at : ça règle d'un
--    coup le fuseau horaire et la publication à 00h05.
--
--    ⚠ Cette colonne ne doit entrer dans AUCUN filtre du feed. Un post de
--    groupe est masqué du feed « Pour toi » ; une anecdote de compétition, au
--    contraire, doit être vue par tout le monde — y compris par ceux qui ne
--    participent pas. C'est là tout l'intérêt du défi.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='voice_posts' AND column_name='competition_day_id') THEN
    ALTER TABLE public.voice_posts
      ADD COLUMN competition_day_id UUID REFERENCES public.competition_days(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS voice_posts_competition_day_idx
  ON public.voice_posts (competition_day_id)
  WHERE competition_day_id IS NOT NULL;

-- ============================================================
-- Row-level security
--
-- Deux fonctions SECURITY DEFINER d'abord, et ce n'est pas un détail de
-- confort : une politique sur competitions qui interroge competition_members,
-- dont la politique interroge competitions, part en récursion infinie. Une
-- fonction SECURITY DEFINER contourne RLS et casse le cycle.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_competition_member(comp UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competition_members m
    WHERE m.competition_id = comp AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_competition_owner(comp UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = comp AND c.owner_id = auth.uid()
  );
$$;

/**
 * Une compétition est-elle encore ouverte aux inscriptions ?
 * On ne rejoint pas ce qui est terminé.
 */
CREATE OR REPLACE FUNCTION public.competition_is_open(comp UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = comp AND c.closed_at IS NULL AND c.ends_on >= CURRENT_DATE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_competition_member(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_competition_owner(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competition_is_open(UUID) TO anon, authenticated, service_role;

-- --- competitions ---
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

-- Une publique se lit par tous, une privée seulement par ses membres.
DROP POLICY IF EXISTS "Public competitions are visible" ON public.competitions;
CREATE POLICY "Public competitions are visible" ON public.competitions
  FOR SELECT USING (
    visibility = 'public'
    OR owner_id = auth.uid()
    OR public.is_competition_member(id)
  );

DROP POLICY IF EXISTS "Users create their own competitions" ON public.competitions;
CREATE POLICY "Users create their own competitions" ON public.competitions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners update their competition" ON public.competitions;
CREATE POLICY "Owners update their competition" ON public.competitions
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owners delete their competition" ON public.competitions;
CREATE POLICY "Owners delete their competition" ON public.competitions
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- --- competition_teams ---
ALTER TABLE public.competition_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teams follow their competition" ON public.competition_teams;
CREATE POLICY "Teams follow their competition" ON public.competition_teams
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.competitions c
            WHERE c.id = competition_id
              AND (c.visibility = 'public' OR c.owner_id = auth.uid()))
    OR public.is_competition_member(competition_id)
  );

DROP POLICY IF EXISTS "Owners manage teams" ON public.competition_teams;
CREATE POLICY "Owners manage teams" ON public.competition_teams
  FOR ALL TO authenticated
  USING (public.is_competition_owner(competition_id))
  WITH CHECK (public.is_competition_owner(competition_id));

-- --- competition_members ---
ALTER TABLE public.competition_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see each other" ON public.competition_members;
CREATE POLICY "Members see each other" ON public.competition_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.competitions c
            WHERE c.id = competition_id AND c.visibility = 'public')
    OR public.is_competition_member(competition_id)
    OR public.is_competition_owner(competition_id)
  );

-- On s'inscrit soi-même, et pas dans une compétition terminée.
DROP POLICY IF EXISTS "Users join open competitions" ON public.competition_members;
CREATE POLICY "Users join open competitions" ON public.competition_members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.competition_is_open(competition_id));

-- On change d'équipe tant qu'aucun point n'a été marqué. Après, c'est figé :
-- sinon on rejoint l'équipe qui gagne à la veille de la clôture.
DROP POLICY IF EXISTS "Members change team until locked" ON public.competition_members;
CREATE POLICY "Members change team until locked" ON public.competition_members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND locked_at IS NULL);

DROP POLICY IF EXISTS "Members can leave" ON public.competition_members;
CREATE POLICY "Members can leave" ON public.competition_members
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_competition_owner(competition_id));

-- --- competition_days ---
ALTER TABLE public.competition_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Days follow their competition" ON public.competition_days;
CREATE POLICY "Days follow their competition" ON public.competition_days
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.competitions c
            WHERE c.id = competition_id
              AND (c.visibility = 'public' OR c.owner_id = auth.uid()))
    OR public.is_competition_member(competition_id)
  );

DROP POLICY IF EXISTS "Owners add days" ON public.competition_days;
CREATE POLICY "Owners add days" ON public.competition_days
  FOR INSERT TO authenticated
  WITH CHECK (public.is_competition_owner(competition_id) AND date > CURRENT_DATE);

-- Le thème d'un jour déjà commencé ne se réécrit pas. Sans cette règle, un
-- organisateur change le sujet après coup et l'histoire devient discutable.
DROP POLICY IF EXISTS "Owners edit future days only" ON public.competition_days;
CREATE POLICY "Owners edit future days only" ON public.competition_days
  FOR UPDATE TO authenticated
  USING (public.is_competition_owner(competition_id) AND date > CURRENT_DATE)
  WITH CHECK (public.is_competition_owner(competition_id) AND date > CURRENT_DATE);

DROP POLICY IF EXISTS "Owners remove future days only" ON public.competition_days;
CREATE POLICY "Owners remove future days only" ON public.competition_days
  FOR DELETE TO authenticated
  USING (public.is_competition_owner(competition_id) AND date > CURRENT_DATE);

-- --- competition_votes ---
ALTER TABLE public.competition_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Votes are visible to participants" ON public.competition_votes;
CREATE POLICY "Votes are visible to participants" ON public.competition_votes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.competitions c
            WHERE c.id = competition_id AND c.visibility = 'public')
    OR public.is_competition_member(competition_id)
  );

-- Voter suppose d'être membre. L'unicité (day_id, voter_id) fait le reste :
-- une voix par personne et par jour.
DROP POLICY IF EXISTS "Members vote once a day" ON public.competition_votes;
CREATE POLICY "Members vote once a day" ON public.competition_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = voter_id
    AND public.is_competition_member(competition_id)
    AND EXISTS (
      SELECT 1 FROM public.voice_posts p
      WHERE p.id = post_id AND p.competition_day_id = day_id
    )
  );

DROP POLICY IF EXISTS "Voters change their vote" ON public.competition_votes;
CREATE POLICY "Voters change their vote" ON public.competition_votes
  FOR UPDATE TO authenticated USING (auth.uid() = voter_id);

-- --- competition_invites ---
ALTER TABLE public.competition_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "See invites addressed to you" ON public.competition_invites;
CREATE POLICY "See invites addressed to you" ON public.competition_invites
  FOR SELECT USING (
    auth.uid() = invited_user_id OR public.is_competition_owner(competition_id)
  );

DROP POLICY IF EXISTS "Owners invite" ON public.competition_invites;
CREATE POLICY "Owners invite" ON public.competition_invites
  FOR INSERT TO authenticated
  WITH CHECK (public.is_competition_owner(competition_id));

DROP POLICY IF EXISTS "Invitees answer" ON public.competition_invites;
CREATE POLICY "Invitees answer" ON public.competition_invites
  FOR UPDATE TO authenticated USING (auth.uid() = invited_user_id);

-- --- competition_templates ---
ALTER TABLE public.competition_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Templates are public" ON public.competition_templates;
CREATE POLICY "Templates are public" ON public.competition_templates
  FOR SELECT USING (true);
-- Aucune politique d'écriture : les modèles viennent du script d'amorçage,
-- qui passe par la clé de service.

-- --- temps réel ---
-- Le classement doit bouger sous les yeux, sans rafraîchir.
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_members; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_votes; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competitions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ============================================================
-- Le classement
--
-- Un SEUL calcul, par joueur. Le classement d'équipe n'en est que la somme,
-- jamais un second calcul : deux formules parallèles finiraient tôt ou tard
-- par se contredire, et c'est exactement le genre d'écart qu'on ne peut pas
-- expliquer à un BDE qui vient de perdre une soirée.
--
-- Les coefficients viennent de competitions.scoring, donc modifiables sans
-- toucher à cette vue.
-- ============================================================
CREATE OR REPLACE VIEW public.competition_player_scores AS
WITH member_posts AS (
  SELECT
    m.competition_id,
    m.user_id,
    m.team_id,
    p.id AS post_id
  FROM public.competition_members m
  LEFT JOIN public.competition_days d ON d.competition_id = m.competition_id
  LEFT JOIN public.voice_posts p
         ON p.competition_day_id = d.id AND p.user_id = m.user_id
),
tallies AS (
  SELECT
    mp.competition_id,
    mp.user_id,
    mp.team_id,
    COUNT(DISTINCT mp.post_id) AS posts,
    COUNT(DISTINCT l.id) AS likes,
    COUNT(DISTINCT c.id) AS comments,
    COUNT(DISTINCT s.id) AS shares
  FROM member_posts mp
  LEFT JOIN public.voice_post_likes l ON l.post_id = mp.post_id
  LEFT JOIN public.comments c ON c.post_id = mp.post_id
  LEFT JOIN public.voice_post_shares s ON s.post_id = mp.post_id
  GROUP BY mp.competition_id, mp.user_id, mp.team_id
)
SELECT
  t.competition_id,
  t.user_id,
  t.team_id,
  t.posts,
  t.likes,
  t.comments,
  t.shares,
  -- Le bonus n'est compté qu'une fois la compétition close : pendant, il
  -- vaut zéro et l'écran annonce « + N bonus à venir ».
  0::bigint AS day_wins,
  (
    -- Le poids « members » est le seul terme collectif du plan : w × effectif
    -- de l'équipe. Le compter ici, une fois par joueur, donne exactement ce
    -- total une fois les joueurs sommés — et garde l'invariant qui compte :
    -- un classement d'équipe qui n'est QUE la somme de ses joueurs, jamais un
    -- second calcul capable de le contredire.
      COALESCE((comp.scoring ->> 'members')::numeric, 0)
    + COALESCE((comp.scoring ->> 'posts')::numeric, 0) * t.posts
    + COALESCE((comp.scoring ->> 'likes')::numeric, 0) * t.likes
    + COALESCE((comp.scoring ->> 'comments')::numeric, 0) * t.comments
    + COALESCE((comp.scoring ->> 'shares')::numeric, 0) * t.shares
  )::numeric AS score
FROM tallies t
JOIN public.competitions comp ON comp.id = t.competition_id;

GRANT SELECT ON public.competition_player_scores TO anon, authenticated, service_role;

-- ============================================================
-- Les types de notification, et un auteur qui peut manquer
-- ============================================================

-- ============================================================
-- Notifications des compétitions
--
-- notifications.type porte une contrainte CHECK énumérant les types connus.
-- Y insérer un type absent échoue — et le pont temps réel qui déclenche les
-- notifications locales avale l'erreur : le symptôme serait « les invitations
-- n'arrivent jamais », sans rien dans les journaux.
-- ============================================================
DO $$
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'like', 'comment', 'share', 'follow',
      'group_added', 'group_post', 'friend_post', 'weekly_winner',
      -- Nouveaux : invitation reçue, thème du jour, résultat final.
      'competition_invite', 'competition_day', 'competition_result'
    ));
END $$;

-- actor_id était NOT NULL, ce qui suppose qu'une notification a toujours un
-- auteur humain. C'est faux ici : « nouveau thème aujourd'hui » et « voici le
-- vainqueur » viennent du système, personne ne les déclenche. Les insérer
-- échouerait, et l'erreur serait avalée par le pont temps réel.
--
-- Le client sait déjà faire : useRealtimeNotifications teste `if (notif.actor_id)`
-- avant de chercher un nom. Rien à changer côté app.
ALTER TABLE public.notifications ALTER COLUMN actor_id DROP NOT NULL;

-- De quoi ouvrir la bonne compétition quand on tape la notification.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='notifications' AND column_name='competition_id') THEN
    ALTER TABLE public.notifications
      ADD COLUMN competition_id UUID REFERENCES public.competitions(id) ON DELETE CASCADE;
  END IF;
END $$;
