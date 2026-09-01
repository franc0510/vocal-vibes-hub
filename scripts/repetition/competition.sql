-- Une compétition de répétition : trois équipes, des anecdotes réparties
-- inégalement, et des anecdotes hors concours qui ne doivent compter nulle part.
--
-- Trois équipes et non deux : avec deux, une erreur de groupement se cache
-- derrière un classement qui a l'air juste.

INSERT INTO auth.users (id) SELECT gen_random_uuid() FROM generate_series(1,9);

INSERT INTO competitions (id,owner_id,name,visibility,starts_on,ends_on,scoring)
SELECT 'cccccccc-0000-0000-0000-00000000000c', id, 'Répétition','public',
       CURRENT_DATE-1, CURRENT_DATE+5,
       '{"members":1,"posts":5,"likes":1,"comments":2,"shares":3,"bonus":20}'::jsonb
FROM (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users) x WHERE n=1;

INSERT INTO competition_teams (id,competition_id,name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c','Rouge'),
  ('aaaaaaaa-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-00000000000c','Bleue'),
  ('aaaaaaaa-0000-0000-0000-000000000003','cccccccc-0000-0000-0000-00000000000c','Verte');

-- 4 en Rouge, 3 en Bleue, 1 en Verte, 1 sans équipe : le joueur solo est là
-- pour vérifier qu'il n'est pas agrégé en une équipe fantôme.
WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users)
INSERT INTO competition_members (competition_id,user_id,team_id)
SELECT 'cccccccc-0000-0000-0000-00000000000c', id,
  CASE WHEN n<=4 THEN 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
       WHEN n<=7 THEN 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
       WHEN n=8  THEN 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
       ELSE NULL END
FROM ids;

INSERT INTO competition_days (id,competition_id,day_index,theme,date) VALUES
  ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c',1,'Ton pire date',CURRENT_DATE-1),
  ('dddddddd-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-00000000000c',2,'La police',CURRENT_DATE);

WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users)
INSERT INTO voice_posts (id,user_id,title,audio_url,duration,competition_day_id)
SELECT gen_random_uuid(), id, 'a'||n||'-'||g, 'u', 10,
       CASE WHEN g=1 THEN 'dddddddd-0000-0000-0000-000000000001'::uuid
            ELSE 'dddddddd-0000-0000-0000-000000000002'::uuid END
FROM ids, generate_series(1, LEAST(n,3)) g;

-- Hors concours : une par joueur. Le total d'anecdotes de la vue doit rester 24.
WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users)
INSERT INTO voice_posts (user_id,title,audio_url,duration)
SELECT id,'hors concours','u',10 FROM ids;

WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users)
INSERT INTO voice_post_likes (user_id,post_id)
SELECT (SELECT id FROM auth.users ORDER BY id LIMIT 1 OFFSET (g-1)), p.id
FROM voice_posts p JOIN ids ON ids.id=p.user_id, generate_series(1, ids.n) g
WHERE p.competition_day_id IS NOT NULL;

WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users)
INSERT INTO comments (user_id,post_id,content)
SELECT p.user_id, p.id, 'c'
FROM voice_posts p JOIN ids ON ids.id=p.user_id, generate_series(1, ids.n % 3) g
WHERE p.competition_day_id IS NOT NULL;

WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users)
INSERT INTO voice_post_shares (user_id,post_id)
SELECT (SELECT id FROM auth.users ORDER BY id LIMIT 1 OFFSET (g-1)), p.id
FROM voice_posts p JOIN ids ON ids.id=p.user_id, generate_series(1, ids.n % 2) g
WHERE p.competition_day_id IS NOT NULL;

-- ------------------------------------------------------------
-- Le scrutin.
--
-- Le jour 1 est dépouillé (il date d'hier, l'urne s'est scellée à 4 h), le
-- jour 2 court encore. C'est le seul endroit qui prouve que la vue distingue
-- les deux : un bonus crédité pour le jour en cours voudrait dire qu'un
-- classement affiché le matin peut changer l'après-midi.
--
-- Volontairement une ÉGALITÉ en tête du jour 1 : les joueurs 1 et 2 recueillent
-- deux voix chacun. La règle est que les ex æquo gagnent TOUS — un bonus n'est
-- qu'un nombre, le retirer à deux personnes pour cause de coïncidence les
-- punirait d'un hasard. La vue et la formule doivent s'accorder là-dessus.
-- ------------------------------------------------------------

WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users),
     -- L'anecdote du jour 1 de chaque joueur : titre « a<n>-1 ».
     j1 AS (
       SELECT p.id AS post_id, ids.n
       FROM voice_posts p JOIN ids ON ids.id = p.user_id
       WHERE p.competition_day_id = 'dddddddd-0000-0000-0000-000000000001'
     ),
     bulletins(voteur, pour) AS (
       VALUES (4,1), (5,1),   -- deux voix pour le joueur 1
              (6,2), (7,2),   -- deux voix pour le joueur 2 : égalité en tête
              (8,3)           -- une seule pour le joueur 3
     )
INSERT INTO competition_votes (competition_id, day_id, voter_id, post_id)
SELECT 'cccccccc-0000-0000-0000-00000000000c',
       'dddddddd-0000-0000-0000-000000000001',
       v.id, j1.post_id
FROM bulletins b
JOIN ids v ON v.n = b.voteur
JOIN j1 ON j1.n = b.pour;

-- Le jour en cours : des voix bien réelles, qui ne doivent créditer personne
-- tant que l'urne n'est pas scellée.
WITH ids AS (SELECT id, row_number() OVER (ORDER BY id) n FROM auth.users),
     j2 AS (
       SELECT p.id AS post_id, ids.n
       FROM voice_posts p JOIN ids ON ids.id = p.user_id
       WHERE p.competition_day_id = 'dddddddd-0000-0000-0000-000000000002'
       AND ids.n = 9
       LIMIT 1
     )
INSERT INTO competition_votes (competition_id, day_id, voter_id, post_id)
SELECT 'cccccccc-0000-0000-0000-00000000000c',
       'dddddddd-0000-0000-0000-000000000002',
       v.id, j2.post_id
FROM ids v, j2
WHERE v.n IN (1, 2, 3);
