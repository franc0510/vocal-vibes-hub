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
