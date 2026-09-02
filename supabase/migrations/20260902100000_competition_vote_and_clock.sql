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
