/**
 * Émet le SQL qui pose les modèles et monte une compétition à partir de l'un
 * d'eux — les mêmes valeurs que le script d'amorçage enverrait à PostgREST.
 *
 * C'est le contrôle qui dit si le moteur est vraiment général : si le modèle
 * mariage demandait la moindre condition particulière, il faudrait le corriger
 * avant le premier défi, pas après.
 *
 *   npx tsx scripts/repetition/modeles.ts mariage | psql -d …
 */

import { TEMPLATES, fromTemplate } from "../../src/lib/competitionTemplates";

const quote = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const text = (v: string) => `'${v.replace(/'/g, "''")}'`;

const key = process.argv[2] ?? "mariage";
const template = TEMPLATES.find((t) => t.key === key);
if (!template) throw new Error(`modèle inconnu : ${key}`);

const out: string[] = [];

for (const t of TEMPLATES) {
  out.push(
    `INSERT INTO competition_templates (key,name,description,uses_teams,default_teams,default_days,default_scoring,sort_order)
     VALUES (${text(t.key)},${text(t.name)},${text(t.description)},${t.uses_teams},
             ${quote(t.default_teams)},${quote(t.default_days)},${quote(t.default_scoring)},${t.sort_order})
     ON CONFLICT (key) DO UPDATE SET
       name=EXCLUDED.name, description=EXCLUDED.description, uses_teams=EXCLUDED.uses_teams,
       default_teams=EXCLUDED.default_teams, default_days=EXCLUDED.default_days,
       default_scoring=EXCLUDED.default_scoring, sort_order=EXCLUDED.sort_order;`
  );
}

// Une date civile, pas un instant : un jour de défi n'a pas d'heure.
const seed = fromTemplate(template, "2026-10-05");
const COMP = "eeeeeeee-0000-0000-0000-00000000000e";

out.push(`INSERT INTO auth.users (id) VALUES ('eeeeeeee-1111-0000-0000-000000000001')
          ON CONFLICT DO NOTHING;`);
out.push(
  `INSERT INTO competitions (id,owner_id,name,description,visibility,starts_on,ends_on,scoring,template_key)
   VALUES ('${COMP}','eeeeeeee-1111-0000-0000-000000000001',${text(template.name)},
           ${text(seed.description)},'private','${seed.starts_on}','${seed.ends_on}',
           ${quote(seed.scoring)},${text(seed.template_key)});`
);
for (const team of seed.teams) {
  out.push(
    `INSERT INTO competition_teams (competition_id,name,color)
     VALUES ('${COMP}',${text(team.name)},${text(team.color)});`
  );
}
for (const day of seed.days) {
  out.push(
    `INSERT INTO competition_days (competition_id,day_index,theme,date)
     VALUES ('${COMP}',${day.day_index},${text(day.theme)},'${day.date}');`
  );
}

// Deux invités, un par camp, avec une anecdote et un like : sans eux le
// classement du mariage serait vide, et « ça marche » ne voudrait rien dire.
out.push(`INSERT INTO auth.users (id) VALUES
  ('eeeeeeee-2222-0000-0000-000000000001'),
  ('eeeeeeee-2222-0000-0000-000000000002') ON CONFLICT DO NOTHING;`);
out.push(`INSERT INTO competition_members (competition_id,user_id,team_id)
  SELECT '${COMP}', u.id, t.id
  FROM (VALUES ('eeeeeeee-2222-0000-0000-000000000001'::uuid, 1),
               ('eeeeeeee-2222-0000-0000-000000000002'::uuid, 2)) AS u(id,n)
  JOIN (SELECT id, row_number() OVER (ORDER BY name DESC) n
        FROM competition_teams WHERE competition_id='${COMP}') t ON t.n = u.n;`);
out.push(`INSERT INTO voice_posts (id,user_id,title,audio_url,duration,competition_day_id)
  SELECT gen_random_uuid(), m.user_id, 'souvenir', 'u', 10, d.id
  FROM competition_members m
  JOIN competition_days d ON d.competition_id = m.competition_id AND d.day_index = 1
  WHERE m.competition_id='${COMP}';`);
out.push(`INSERT INTO voice_post_likes (user_id,post_id)
  SELECT 'eeeeeeee-1111-0000-0000-000000000001', p.id
  FROM voice_posts p JOIN competition_days d ON d.id = p.competition_day_id
  WHERE d.competition_id='${COMP}';`);

console.log(out.join("\n"));
