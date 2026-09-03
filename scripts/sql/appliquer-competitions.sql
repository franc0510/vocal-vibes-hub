-- ============================================================
--  VocMe — le moteur de défis
-- ============================================================
--
--  À COLLER DANS : tableau de bord Supabase → SQL Editor → Run
--
--  Ce fichier est la concaténation des cinq migrations :
--    supabase/migrations/20260901100000_competitions.sql
--    supabase/migrations/20260901110000_competition_notification_types.sql
--    supabase/migrations/20260902100000_competition_vote_and_clock.sql
--    supabase/migrations/20260903100000_competition_join_lock.sql
--    supabase/migrations/20260904100000_competition_invite_preview.sql
--
--  Il est idempotent : chaque ajout est conditionné à son absence, donc le
--  relancer ne casse rien et ne perd aucune donnée. Il a été rejoué de zéro
--  contre un vrai Postgres, avec 55 assertions sur les règles d'accès du moteur de défis.
--
--  Sans lui, l'onglet Challenges s'ouvre sur des tables qui n'existent pas.
--
--  Si une version antérieure est DÉJÀ passée en production, le repasser reste
--  la bonne manœuvre. La cinquième partie, en particulier, répare un défaut
--  visible : un défi PRIVÉ ne pouvait être rejoint par personne, son code
--  restant illisible à qui n'était pas déjà membre.
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


-- ============================================================
-- Le vote du jour, la pendule à 4 h, et les verrous qui manquaient.
--
-- La migration précédente avait posé la table `competition_votes` et le terme
-- `bonus` du barème, mais rien n'écrivait jamais dedans et la vue rendait
-- `day_wins = 0` en dur : le scrutin existait sur le papier seulement. Ce
-- fichier le branche, et corrige quatre règles qui ne tenaient pas à l'usage.
--
-- La décision de fond est l'heure de bascule :
--
--   UNE JOURNÉE DE DÉFI VA DE 4 H À 4 H, PAS DE MINUIT À MINUIT.
--
-- Le dépouillement se fait quand tout le monde dort — proclamer un gagnant à
-- minuit pile revient à fermer l'urne pendant que la moitié des gens écoutent
-- encore. Au passage, celui qui publie à 00 h 30 compte pour la soirée qu'il
-- raconte, et non pour le thème du lendemain qu'il n'a pas lu.
-- ============================================================

-- ------------------------------------------------------------
-- 1) La pendule
-- ------------------------------------------------------------

/**
 * La date de compétition en cours, dans le fuseau de l'organisateur.
 *
 * Jumelle de `competitionDate()` dans src/lib/competitionClock.ts. Les deux
 * doivent dire la même chose : celle-ci arbitre, l'autre évite d'afficher un
 * bouton que celle-ci refusera.
 */
CREATE OR REPLACE FUNCTION public.competition_today(comp UUID)
RETURNS DATE
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (((now() AT TIME ZONE COALESCE(c.timezone, 'Europe/Paris'))
           - interval '4 hours')::date)
  FROM public.competitions c
  WHERE c.id = comp;
$$;

/**
 * Ce jour est-il celui qui court, donc ouvert au vote ?
 *
 * Après 4 h le lendemain, l'urne est scellée. Sans cette règle, un bonus déjà
 * porté au classement du matin pourrait changer de main dans la journée.
 */
CREATE OR REPLACE FUNCTION public.competition_day_is_open(day UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competition_days d
    WHERE d.id = day
      AND d.date = public.competition_today(d.competition_id)
  );
$$;

-- Une compétition qui se termine aujourd'hui reste joignable jusqu'à 4 h
-- demain : c'est la même journée pour tout le monde, y compris pour le
-- retardataire qui découvre le défi à 1 h du matin.
CREATE OR REPLACE FUNCTION public.competition_is_open(comp UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = comp
      AND c.closed_at IS NULL
      AND c.ends_on >= public.competition_today(c.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.competition_today(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.competition_day_is_open(UUID) TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 2) Les jours : un défi qui démarre aujourd'hui doit avoir un jour 1
--
--    L'ancienne règle exigeait `date > CURRENT_DATE`. Une compétition créée
--    pour démarrer le jour même voyait donc l'insertion de son jour 1 refusée
--    en silence : zéro jour, aucun thème, un écran vide et personne pour
--    comprendre pourquoi. C'était le premier bug remonté par les testeurs.
--
--    L'écriture reste interdite sur un jour PASSÉ ou COMMENCÉ (`>` pour
--    UPDATE et DELETE) : réécrire le thème d'hier invalide les anecdotes déjà
--    publiées sous l'ancien.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "Owners add days" ON public.competition_days;
CREATE POLICY "Owners add days" ON public.competition_days
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_competition_owner(competition_id)
    AND date >= public.competition_today(competition_id)
  );

-- Le `WITH CHECK` est explicite et non laissé à Postgres, qui recopierait le
-- `USING` : la règle porte ici sur la ligne AVANT et APRÈS, et les deux
-- doivent viser un jour encore à venir. Sans lui, on pourrait déplacer un jour
-- futur vers une date passée.
DROP POLICY IF EXISTS "Owners edit future days only" ON public.competition_days;
CREATE POLICY "Owners edit future days only" ON public.competition_days
  FOR UPDATE TO authenticated
  USING (
    public.is_competition_owner(competition_id)
    AND date > public.competition_today(competition_id)
  )
  WITH CHECK (
    public.is_competition_owner(competition_id)
    AND date > public.competition_today(competition_id)
  );

DROP POLICY IF EXISTS "Owners remove future days only" ON public.competition_days;
CREATE POLICY "Owners remove future days only" ON public.competition_days
  FOR DELETE TO authenticated
  USING (
    public.is_competition_owner(competition_id)
    AND date > public.competition_today(competition_id)
  );

-- ------------------------------------------------------------
-- 3) Le verrou d'équipe, qui n'a jamais existé
--
--    `locked_at` était LU partout — par la politique RLS, par `canChangeTeam()`
--    et par l'écran qui annonce « ton équipe est verrouillée » — et ÉCRIT nulle
--    part. On pouvait donc changer d'équipe autant qu'on voulait, y compris la
--    veille de la clôture pour rejoindre celle qui mène. Deuxième bug remonté.
--
--    Le verrou tombe au premier point marqué, c'est-à-dire à la première
--    anecdote publiée sous un thème de la compétition : exactement ce que
--    l'écran promettait déjà.
-- ------------------------------------------------------------

/**
 * SECURITY DEFINER parce que la fonction écrit dans `competition_members`,
 * protégée par RLS : sans ça, la politique « je ne modifie que ma ligne, et
 * seulement tant qu'elle est déverrouillée » ferait échouer l'écriture même
 * du verrou — la règle s'empêcherait elle-même de s'appliquer.
 */
CREATE OR REPLACE FUNCTION public.lock_competition_team()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.competition_members m
     SET locked_at = now()
    FROM public.competition_days d
   WHERE d.id = NEW.competition_day_id
     AND m.competition_id = d.competition_id
     AND m.user_id = NEW.user_id
     AND m.locked_at IS NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS lock_competition_team_on_post ON public.voice_posts;
CREATE TRIGGER lock_competition_team_on_post
  AFTER INSERT ON public.voice_posts
  FOR EACH ROW
  WHEN (NEW.competition_day_id IS NOT NULL)
  EXECUTE FUNCTION public.lock_competition_team();

-- Le `WITH CHECK` manquait, et Postgres recopiait alors le `USING` — dont le
-- `locked_at IS NULL` faisait échouer toute écriture posant justement le
-- verrou. La ligne d'arrivée doit rester la mienne ; c'est le `USING` qui dit
-- quand j'ai encore le droit d'y toucher.
DROP POLICY IF EXISTS "Members change team until locked" ON public.competition_members;
CREATE POLICY "Members change team until locked" ON public.competition_members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND locked_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 4) Le vote du jour
--
--    Une voix par personne et par jour — l'unicité (day_id, voter_id) était
--    déjà là. Restaient trois règles sans lesquelles le scrutin ne dit rien.
-- ------------------------------------------------------------

-- (a) On ne vote pas pour soi. Sans cette règle, la première voix de chacun
--     est la sienne et le classement du jour ne mesure plus que l'assiduité.
-- (b) On ne vote pas sur un jour déjà dépouillé.
DROP POLICY IF EXISTS "Members vote once a day" ON public.competition_votes;
CREATE POLICY "Members vote once a day" ON public.competition_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = voter_id
    AND public.is_competition_member(competition_id)
    AND public.competition_day_is_open(day_id)
    AND EXISTS (
      SELECT 1 FROM public.voice_posts p
      WHERE p.id = post_id
        AND p.competition_day_id = day_id
        AND p.user_id <> auth.uid()
    )
  );

-- Changer d'avis, tant que l'urne est ouverte. Le `WITH CHECK` reprend les
-- mêmes conditions : sans lui, Postgres recopierait le `USING` et laisserait
-- déplacer sa voix vers l'anecdote d'un autre jour, ou vers la sienne.
DROP POLICY IF EXISTS "Voters change their vote" ON public.competition_votes;
CREATE POLICY "Voters change their vote" ON public.competition_votes
  FOR UPDATE TO authenticated
  USING (auth.uid() = voter_id AND public.competition_day_is_open(day_id))
  WITH CHECK (
    auth.uid() = voter_id
    AND public.competition_day_is_open(day_id)
    AND EXISTS (
      SELECT 1 FROM public.voice_posts p
      WHERE p.id = post_id
        AND p.competition_day_id = day_id
        AND p.user_id <> auth.uid()
    )
  );

-- Retirer sa voix, tant que l'urne est ouverte. Il manquait toute politique de
-- suppression : on pouvait déplacer sa voix mais jamais se raviser.
DROP POLICY IF EXISTS "Voters withdraw their vote" ON public.competition_votes;
CREATE POLICY "Voters withdraw their vote" ON public.competition_votes
  FOR DELETE TO authenticated
  USING (auth.uid() = voter_id AND public.competition_day_is_open(day_id));

-- ------------------------------------------------------------
-- 5) Le barème, gelé au départ
--
--    Les coefficients s'ajustent la veille d'un lancement, en voyant les
--    effectifs réels. Après le départ, non : changer un poids en cours de
--    route rebat rétroactivement tout un classement doté d'un lot.
--
--    RLS ne sait pas comparer OLD et NEW, d'où un trigger. Sans lui la règle
--    ne tiendrait que dans l'écran, donc pas du tout.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.freeze_competition_scoring()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.scoring IS DISTINCT FROM OLD.scoring
     AND OLD.starts_on <= (((now() AT TIME ZONE COALESCE(OLD.timezone, 'Europe/Paris'))
                            - interval '4 hours')::date)
  THEN
    RAISE EXCEPTION
      'Le barème est gelé depuis le départ de la compétition.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS freeze_competition_scoring_on_update ON public.competitions;
CREATE TRIGGER freeze_competition_scoring_on_update
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_competition_scoring();

-- ------------------------------------------------------------
-- 6) Le classement, avec le dépouillement pour de bon
--
--    `day_wins` valait `0::bigint` en dur : le terme `bonus` du barème ne
--    pouvait donc jamais rien valoir, et l'écran promettait des points qui
--    n'arrivaient pas.
--
--    Le calcul reste UN SEUL calcul, par joueur. Le classement d'équipe n'en
--    est que la somme, jamais un second calcul : deux formules parallèles
--    finiraient par se contredire, et c'est l'écart qu'on ne peut pas
--    expliquer à un BDE qui vient de perdre une soirée.
-- ------------------------------------------------------------
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
),
-- Le dépouillement : les voix d'un jour dont l'urne est scellée, c'est-à-dire
-- à partir de 4 h le lendemain, dans le fuseau de l'organisateur. Les voix
-- d'un jour en cours ne comptent pas encore — elles peuvent changer.
day_ballots AS (
  SELECT
    d.competition_id,
    d.id AS day_id,
    p.user_id,
    v.post_id,
    COUNT(v.id) AS voix
  FROM public.competition_days d
  JOIN public.competitions c ON c.id = d.competition_id
  JOIN public.competition_votes v ON v.day_id = d.id
  JOIN public.voice_posts p ON p.id = v.post_id
  WHERE ((((d.date + 1)::timestamp + interval '4 hours')
          AT TIME ZONE COALESCE(c.timezone, 'Europe/Paris')) <= now())
  GROUP BY d.competition_id, d.id, p.user_id, v.post_id
),
-- RANK() et non ROW_NUMBER() : en cas d'égalité, TOUS les ex æquo gagnent.
-- C'est l'inverse du gel de fin de compétition, qui ne désigne aucun vainqueur
-- en cas d'égalité — mais là il s'agit d'un lot physique unique, que
-- l'organisateur doit trancher. Un bonus n'est qu'un nombre : le retirer à
-- deux personnes pour cause de coïncidence les punit d'un hasard.
day_winners AS (
  SELECT competition_id, day_id, user_id
  FROM (
    SELECT b.*, RANK() OVER (PARTITION BY b.day_id ORDER BY b.voix DESC) AS pos
    FROM day_ballots b
  ) ranked
  WHERE pos = 1
),
-- DISTINCT day_id : deux anecdotes en tête le même jour ne valent qu'un bonus.
wins AS (
  SELECT competition_id, user_id, COUNT(DISTINCT day_id) AS day_wins
  FROM day_winners
  GROUP BY competition_id, user_id
)
SELECT
  t.competition_id,
  t.user_id,
  t.team_id,
  t.posts,
  t.likes,
  t.comments,
  t.shares,
  COALESCE(w.day_wins, 0)::bigint AS day_wins,
  (
    -- Le poids « members » est le seul terme collectif du plan : w × effectif
    -- de l'équipe. Le compter ici, une fois par joueur, donne exactement ce
    -- total une fois les joueurs sommés — et garde l'invariant qui compte :
    -- un classement d'équipe qui n'est QUE la somme de ses joueurs.
      COALESCE((comp.scoring ->> 'members')::numeric, 0)
    + COALESCE((comp.scoring ->> 'posts')::numeric, 0) * t.posts
    + COALESCE((comp.scoring ->> 'likes')::numeric, 0) * t.likes
    + COALESCE((comp.scoring ->> 'comments')::numeric, 0) * t.comments
    + COALESCE((comp.scoring ->> 'shares')::numeric, 0) * t.shares
    -- Les bonus sont acquis dès le dépouillement du matin, plus retenus
    -- jusqu'à la clôture : un classement qui bouge chaque jour à heure fixe
    -- fait rouvrir l'application, un total figé pendant six jours non.
    + COALESCE((comp.scoring ->> 'bonus')::numeric, 0) * COALESCE(w.day_wins, 0)
  )::numeric AS score
FROM tallies t
JOIN public.competitions comp ON comp.id = t.competition_id
LEFT JOIN wins w
       ON w.competition_id = t.competition_id AND w.user_id = t.user_id;

GRANT SELECT ON public.competition_player_scores TO anon, authenticated, service_role;


-- ============================================================
-- L'équipe se choisit en rejoignant, et une seule fois.
--
-- Jusqu'ici le verrou tombait à la première anecdote publiée. À l'usage c'est
-- trop tard et trop flou : on rejoint, on hésite, on change trois fois, et
-- surtout on peut encore basculer vers l'équipe qui mène tant qu'on n'a rien
-- publié. La règle devient donc :
--
--   ON CHOISIT SON CAMP EN ENTRANT, ET C'EST DÉFINITIF.
--
-- Une seule décision, à un seul moment — celui où l'on ne sait pas encore qui
-- va gagner. C'est ce qui rend le choix honnête.
-- ============================================================

/**
 * Pose le verrou dès que l'équipe devient non nulle.
 *
 * Deux chemins mènent ici et le trigger les couvre tous les deux : l'équipe
 * choisie au moment de rejoindre (INSERT), et celle choisie après coup par un
 * membre entré sans camp (UPDATE). Dans les deux cas la politique RLS
 * « Members change team until locked » (USING ... AND locked_at IS NULL) ferme
 * ensuite la porte d'elle-même.
 *
 * Écrit dans un trigger et non dans le client : une valeur que l'application
 * pose elle-même est une valeur que l'application peut oublier de poser.
 */
CREATE OR REPLACE FUNCTION public.lock_team_on_pick()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.team_id IS NOT NULL AND NEW.locked_at IS NULL THEN
    NEW.locked_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_team_on_pick_trigger ON public.competition_members;
CREATE TRIGGER lock_team_on_pick_trigger
  BEFORE INSERT OR UPDATE OF team_id ON public.competition_members
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_team_on_pick();

-- ------------------------------------------------------------
-- Le message du gel de barème, en anglais.
--
-- Il est affiché tel quel à l'utilisateur : c'est donc une chaîne d'interface,
-- et l'interface des défis est en anglais.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_competition_scoring()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.scoring IS DISTINCT FROM OLD.scoring
     AND OLD.starts_on <= (((now() AT TIME ZONE COALESCE(OLD.timezone, 'Europe/Paris'))
                            - interval '4 hours')::date)
  THEN
    RAISE EXCEPTION
      'Scoring is frozen once the challenge has started.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- Un code de partage pour tout le monde, publiques comprises.
--
-- Le code n'était donné qu'aux compétitions privées, pour qui il sert de
-- sésame. Mais il sert aussi, et surtout, à inviter : « rejoins avec ABC123 »
-- se dit au téléphone, se colle dans un groupe, s'écrit au tableau. Une
-- publique sans code obligeait à expliquer comment la chercher.
-- ------------------------------------------------------------

/**
 * Un code court, lisible au téléphone : ni 0/O ni 1/I.
 *
 * Jumeau de `makeJoinCode()` dans src/hooks/useCompetitions.ts, avec le même
 * alphabet — les deux doivent produire des codes qu'on dicte sans hésiter.
 */
CREATE OR REPLACE FUNCTION public.make_join_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate TEXT;
  i INTEGER;
BEGIN
  -- La colonne est UNIQUE : on retente plutôt que d'échouer sur une collision,
  -- qui reste très improbable mais pas impossible.
  FOR attempt IN 1..20 LOOP
    candidate := '';
    FOR i IN 1..6 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.competitions WHERE join_code = candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

/**
 * Toute compétition naît avec un code.
 *
 * En trigger et non dans le client, pour la même raison que le verrou
 * d'équipe : le script de lancement, l'API et l'application créent tous des
 * compétitions, et un code posé à trois endroits est un code oublié à un
 * quatrième. Ici il n'y a qu'un seul endroit.
 */
CREATE OR REPLACE FUNCTION public.ensure_join_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.join_code IS NULL THEN
    NEW.join_code := public.make_join_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_join_code_trigger ON public.competitions;
CREATE TRIGGER ensure_join_code_trigger
  BEFORE INSERT ON public.competitions
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_join_code();

-- Les compétitions déjà créées sans code en reçoivent un. Une par une, la
-- fonction lisant la table pour éviter les collisions.
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM public.competitions WHERE join_code IS NULL LOOP
    UPDATE public.competitions
       SET join_code = public.make_join_code()
     WHERE id = comp.id;
  END LOOP;
END $$;


-- ============================================================
-- Une invitation se lit avant d'être acceptée.
--
-- La politique de lecture des compétitions dit : publique, ou propriétaire, ou
-- déjà membre. Rien d'autre. Un code d'invitation n'y figure pas — ce qui a
-- deux conséquences, dont une était un bug en production :
--
--   1. Un lien d'invitation ne peut RIEN montrer d'un défi privé. La ligne est
--      invisible tant qu'on n'est pas dedans, donc on rejoindrait à l'aveugle.
--   2. Pire : « rejoindre avec un code » NE MARCHAIT PAS pour un défi privé.
--      `findByCode` lit la table sous cette même politique, obtenait zéro
--      ligne, et l'écran répondait « No challenge with that code ». Le code de
--      partage — présenté dans le schéma comme « le sésame d'une compétition
--      privée » — n'a donc jamais ouvert quoi que ce soit.
--
-- RLS travaille par ligne, pas par colonne : aucune politique ne peut dire
-- « montre ces cinq champs à qui détient le code ». D'où une fonction, qui
-- expose exactement ce qu'une invitation doit montrer, et rien de plus.
--
-- CONNAÎTRE LE CODE EST LA PREUVE DE L'INVITATION.
--
-- C'est déjà ce que le schéma suppose : le code est unique, tiré dans un
-- alphabet sans ambiguïté, et il ne circule que si son propriétaire l'a
-- partagé. Ce qu'on ne révèle pas ici : les membres, les votes, les anecdotes.
-- Seulement de quoi décider si l'on entre.
-- ============================================================

CREATE OR REPLACE FUNCTION public.competition_invite_preview(code TEXT)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  comp public.competitions;
  wanted TEXT := upper(btrim(coalesce(code, '')));
BEGIN
  -- Un code vide ne doit pas ramener la première ligne venue.
  IF wanted = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO comp FROM public.competitions c WHERE c.join_code = wanted;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', comp.id,
    'name', comp.name,
    'description', comp.description,
    'prize', comp.prize,
    'visibility', comp.visibility,
    'starts_on', comp.starts_on,
    'ends_on', comp.ends_on,
    'timezone', comp.timezone,
    'closed_at', comp.closed_at,
    -- La durée n'est pas un réglage : c'est le nombre de jours.
    'day_count', (SELECT count(*) FROM public.competition_days d
                   WHERE d.competition_id = comp.id),
    'member_count', (SELECT count(*) FROM public.competition_members m
                      WHERE m.competition_id = comp.id),
    -- Les équipes sont nécessaires AVANT d'entrer : on choisit son camp en
    -- rejoignant, et ce choix est définitif. Les cacher obligerait à s'engager
    -- sans savoir entre quoi et quoi.
    'teams', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'color', t.color)
                       ORDER BY t.name)
      FROM public.competition_teams t WHERE t.competition_id = comp.id
    ), '[]'::jsonb),
    -- Pour que l'écran sache proposer « rejoindre » ou « ouvrir ».
    'is_member', public.is_competition_member(comp.id),
    'is_open', public.competition_is_open(comp.id)
  );
END;
$$;

-- `anon` y a droit : quelqu'un qui reçoit un lien n'a pas encore de compte, et
-- doit pouvoir voir à quoi on l'invite avant de s'inscrire. C'est précisément
-- ce qui manquait — l'écran de connexion jetait l'invitation.
GRANT EXECUTE ON FUNCTION public.competition_invite_preview(TEXT)
  TO anon, authenticated, service_role;
