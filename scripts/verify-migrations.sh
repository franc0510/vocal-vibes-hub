#!/usr/bin/env bash
#
# Replays every migration from scratch against a throwaway Postgres, then
# asserts the row-level security rules for story illustrations actually hold.
#
# This exists because RLS mistakes are invisible until someone exploits them,
# and because a migration chain that cannot be replayed from zero is a chain
# nobody can safely reset.
#
#   PGHOST=localhost PGPORT=5432 PGUSER=postgres ./scripts/verify-migrations.sh
#
# Requires: psql. Connection comes from the standard PG* environment
# variables, so it works unchanged against a local server or a CI service.

set -euo pipefail

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
DB="vocme_verify_$$"

# psql against the freshly created database, failing hard on any error.
q() { psql -d "$DB" -v ON_ERROR_STOP=1 -q -tAc "$1"; }

cleanup() { psql -d postgres -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

failures=0
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  ✅ %s\n' "$1"
  else
    printf '  ❌ %s (attendu %s, obtenu %s)\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}

echo "▸ Base de test : $DB"
psql -d postgres -q -c "CREATE DATABASE $DB" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/supabase-stub.sql" >/dev/null 2>&1

echo "▸ Rejeu de toutes les migrations"
for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  if psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/mig.$$ 2>&1; then
    printf '  ✅ %s\n' "$(basename "$f")"
  else
    printf '  ❌ %s\n' "$(basename "$f")"
    grep -v 'wal_level\|^HINT:' /tmp/mig.$$ | head -4
    failures=$((failures + 1))
  fi
done
rm -f /tmp/mig.$$

echo "▸ Migration des illustrations rejouable"
LATEST="$(ls "$ROOT"/supabase/migrations/*story_illustrations.sql | tail -1)"
if psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$LATEST" >/dev/null 2>&1; then
  printf '  ✅ seconde application sans erreur\n'
else
  printf '  ❌ la migration n'"'"'est pas idempotente\n'
  failures=$((failures + 1))
fi

echo "▸ Contraintes"
OWNER='aaaaaaaa-0000-0000-0000-000000000001'
INTRUDER='bbbbbbbb-0000-0000-0000-000000000002'
POST='cccccccc-0000-0000-0000-000000000003'

q "INSERT INTO auth.users (id) VALUES ('$OWNER'), ('$INTRUDER') ON CONFLICT DO NOTHING;
   INSERT INTO public.voice_posts (id, user_id, title, audio_url, duration)
     VALUES ('$POST','$OWNER','Le chien du voisin','http://audio',60);" >/dev/null

check "statut par défaut = none" "none" "$(q "SELECT illustration_status FROM voice_posts WHERE id='$POST'")"

q "UPDATE voice_posts SET illustration_status='bogus' WHERE id='$POST'" >/dev/null 2>&1 \
  && check "statut invalide rejeté" "rejeté" "accepté" \
  || check "statut invalide rejeté" "rejeté" "rejeté"

q "INSERT INTO post_illustrations (post_id, idx, image_url, start_ms, end_ms)
   VALUES ('$POST',0,'http://p0',0,5000)" >/dev/null

q "INSERT INTO post_illustrations (post_id, idx, image_url) VALUES ('$POST',0,'http://dup')" >/dev/null 2>&1 \
  && check "doublon (post_id, idx) rejeté" "rejeté" "accepté" \
  || check "doublon (post_id, idx) rejeté" "rejeté" "rejeté"

echo "▸ Row-level security"
as() { psql -d "$DB" -q -tAc "SET ROLE $1; SET request.jwt.claim.sub='$2'; $3"; }

# Sanity first: if auth.uid() does not resolve, every check below would "pass"
# by accident, so assert the harness itself works before trusting it.
check "auth.uid() résout sous authenticated" "$OWNER" \
  "$(as authenticated "$OWNER" "SELECT auth.uid()::text;" 2>/dev/null)"

check "lecture publique par un tiers" "1" \
  "$(as authenticated "$INTRUDER" "SELECT count(*) FROM post_illustrations WHERE post_id='$POST';" 2>/dev/null)"

as authenticated "$INTRUDER" "DELETE FROM post_illustrations WHERE post_id='$POST';" >/dev/null 2>&1 || true
check "suppression par un tiers bloquée" "1" "$(q "SELECT count(*) FROM post_illustrations WHERE post_id='$POST'")"

as authenticated "$INTRUDER" "INSERT INTO post_illustrations (post_id, idx, image_url) VALUES ('$POST',9,'http://forge');" >/dev/null 2>&1 || true
check "faux panneau d'un tiers bloqué" "1" "$(q "SELECT count(*) FROM post_illustrations WHERE post_id='$POST'")"

as authenticated "$OWNER" "INSERT INTO post_illustrations (post_id, idx, image_url) VALUES ('$POST',8,'http://self');" >/dev/null 2>&1 || true
check "le propriétaire ne peut pas forger de panneau" "1" "$(q "SELECT count(*) FROM post_illustrations WHERE post_id='$POST'")"

as service_role "$OWNER" "INSERT INTO post_illustrations (post_id, idx, image_url) VALUES ('$POST',1,'http://svc');" >/dev/null 2>&1 || true
check "le service role peut écrire" "2" "$(q "SELECT count(*) FROM post_illustrations WHERE post_id='$POST'")"

as authenticated "$OWNER" "DELETE FROM post_illustrations WHERE post_id='$POST';" >/dev/null 2>&1 || true
check "le propriétaire peut supprimer les siens" "0" "$(q "SELECT count(*) FROM post_illustrations WHERE post_id='$POST'")"

q "DELETE FROM voice_posts WHERE id='$POST'" >/dev/null
check "cascade à la suppression du post" "0" "$(q "SELECT count(*) FROM post_illustrations WHERE post_id='$POST'")"

echo "▸ Vidéo et crédits"
check "bucket story_videos public" "t" \
  "$(q "SELECT public FROM storage.buckets WHERE id='story_videos'")"

q "INSERT INTO public.voice_posts (id, user_id, title, audio_url, duration)
   VALUES ('$POST','$OWNER','Test vidéo','http://audio',60)" >/dev/null
check "video_status par défaut = none" "none" "$(q "SELECT video_status FROM voice_posts WHERE id='$POST'")"

q "UPDATE voice_posts SET video_status='bogus' WHERE id='$POST'" >/dev/null 2>&1 \
  && check "video_status invalide rejeté" "rejeté" "accepté" \
  || check "video_status invalide rejeté" "rejeté" "rejeté"

check "illustration_requested par défaut = false" "f" \
  "$(q "SELECT illustration_requested FROM voice_posts WHERE id='$POST'")"

q "INSERT INTO public.illustration_credits (user_id, credits) VALUES ('$OWNER', 3)" >/dev/null
check "le propriétaire lit son solde" "3" \
  "$(as authenticated "$OWNER" "SELECT credits FROM illustration_credits WHERE user_id='$OWNER';" 2>/dev/null)"

# Le point sensible : personne ne doit pouvoir s'offrir des générations.
check "un tiers ne voit pas le solde d'autrui" "" \
  "$(as authenticated "$INTRUDER" "SELECT credits FROM illustration_credits WHERE user_id='$OWNER';" 2>/dev/null)"

as authenticated "$OWNER" "UPDATE illustration_credits SET credits=999 WHERE user_id='$OWNER';" >/dev/null 2>&1 || true
check "personne ne peut se créditer" "3" "$(q "SELECT credits FROM illustration_credits WHERE user_id='$OWNER'")"

q "INSERT INTO public.illustration_credits (user_id, credits) VALUES ('$INTRUDER', -1)" >/dev/null 2>&1 \
  && check "solde négatif rejeté" "rejeté" "accepté" \
  || check "solde négatif rejeté" "rejeté" "rejeté"

# listened_posts était absente de la base de production alors qu'une migration
# la crée : rien ici ne la regardait, donc la dérive est passée inaperçue et
# « les non écoutées d'abord » ne jouait pour personne, en silence.
echo "▸ Écoutes"
check "sa propre écoute est acceptée" "1" \
  "$(as authenticated "$INTRUDER" "INSERT INTO listened_posts (user_id, post_id) VALUES ('$INTRUDER','$POST') RETURNING 1;" 2>/dev/null)"

as authenticated "$INTRUDER" "INSERT INTO listened_posts (user_id, post_id) VALUES ('$OWNER','$POST');" >/dev/null 2>&1 \
  && check "écrire l'écoute d'autrui bloqué" "rejeté" "accepté" \
  || check "écrire l'écoute d'autrui bloqué" "rejeté" "rejeté"

check "chacun ne lit que les siennes" "0" \
  "$(as authenticated "$OWNER" "SELECT count(*) FROM listened_posts;" 2>/dev/null)"

q "DELETE FROM voice_posts WHERE id='$POST'" >/dev/null

check "écoutes supprimées avec l'anecdote" "0" \
  "$(q "SELECT count(*) FROM listened_posts WHERE post_id='$POST'")"

# Le moteur de compétitions. Ces règles gardent l'intégrité d'un défi doté d'un
# lot : sans elles, on réécrit un thème après coup, on vote pour soi, on rejoint
# l'équipe qui gagne la veille de la clôture, ou on rebat le barème en course.
echo "▸ Compétitions"
C_OWNER="$OWNER"
C_MEMBER="$INTRUDER"
C_MEMBER2=$(q "INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id")
C_OUT=$(q "INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id")

PRIV=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Privée','private',CURRENT_DATE,CURRENT_DATE+7) RETURNING id")
PUB=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Publique','public',CURRENT_DATE,CURRENT_DATE+7) RETURNING id")
q "INSERT INTO competition_members (competition_id,user_id) VALUES ('$PRIV','$C_MEMBER'),('$PUB','$C_MEMBER'),('$PUB','$C_MEMBER2'),('$PUB','$C_OWNER')" >/dev/null

check "un membre voit la compétition privée" "1" \
  "$(as authenticated "$C_MEMBER" "SELECT count(*) FROM competitions WHERE id='$PRIV';" 2>/dev/null)"
check "un étranger ne voit pas la privée" "0" \
  "$(as authenticated "$C_OUT" "SELECT count(*) FROM competitions WHERE id='$PRIV';" 2>/dev/null)"
check "tout le monde voit la publique" "1" \
  "$(as authenticated "$C_OUT" "SELECT count(*) FROM competitions WHERE id='$PUB';" 2>/dev/null)"

# --- La pendule : la journée bascule à 4 h, dans le fuseau de la compétition.
check "competition_today() suit le fuseau déclaré" "1" \
  "$(q "SELECT CASE WHEN competition_today('$PUB') BETWEEN CURRENT_DATE-1 AND CURRENT_DATE+1 THEN 1 ELSE 0 END")"

# --- Le bug qui rendait un défi invisible : une compétition démarrant
#     AUJOURD'HUI voyait l'insertion de son jour 1 refusée (date > CURRENT_DATE),
#     donc zéro jour, donc un écran vide et personne pour comprendre pourquoi.
TODAY_C=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Départ aujourd hui','public',CURRENT_DATE,CURRENT_DATE+2) RETURNING id")
as authenticated "$C_OWNER" "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$TODAY_C',1,'Jour 1',competition_today('$TODAY_C'));" >/dev/null 2>&1 || true
check "le jour 1 d'un défi qui démarre aujourd'hui s'insère" "1" \
  "$(q "SELECT count(*) FROM competition_days WHERE competition_id='$TODAY_C'")"
as authenticated "$C_OWNER" "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$TODAY_C',9,'Hier',competition_today('$TODAY_C')-1);" >/dev/null 2>&1 || true
check "un jour déjà passé ne s'ajoute pas" "1" \
  "$(q "SELECT count(*) FROM competition_days WHERE competition_id='$TODAY_C'")"

# Les jours passés sont posés en service : le propriétaire n'y a pas droit.
PASTDAY=$(q "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$PUB',1,'Hier',competition_today('$PUB')-1) RETURNING id")
TODAYDAY=$(q "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$PUB',2,'Aujourd hui',competition_today('$PUB')) RETURNING id")
FUTDAY=$(q "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$PUB',3,'Demain',competition_today('$PUB')+1) RETURNING id")

as authenticated "$C_OWNER" "UPDATE competition_days SET theme='réécrit' WHERE id='$PASTDAY';" >/dev/null 2>&1 || true
check "le thème d'un jour passé ne se réécrit pas" "Hier" "$(q "SELECT theme FROM competition_days WHERE id='$PASTDAY'")"
as authenticated "$C_OWNER" "UPDATE competition_days SET theme='réécrit' WHERE id='$TODAYDAY';" >/dev/null 2>&1 || true
check "le thème du jour en cours ne se réécrit pas non plus" "Aujourd hui" "$(q "SELECT theme FROM competition_days WHERE id='$TODAYDAY'")"
as authenticated "$C_OWNER" "UPDATE competition_days SET theme='ajusté' WHERE id='$FUTDAY';" >/dev/null 2>&1 || true
check "un jour à venir reste modifiable" "ajusté" "$(q "SELECT theme FROM competition_days WHERE id='$FUTDAY'")"
as authenticated "$C_MEMBER" "UPDATE competition_days SET theme='pirate' WHERE id='$FUTDAY';" >/dev/null 2>&1 || true
check "un simple membre ne touche pas aux thèmes" "ajusté" "$(q "SELECT theme FROM competition_days WHERE id='$FUTDAY'")"

# --- L'équipe se choisit UNE FOIS, et le verrou tombe à cet instant.
#
#     Avant, `locked_at` était lu par la politique RLS, par le hook et par
#     l'écran… et écrit nulle part : le verrou n'existait pas. Il tombait
#     ensuite à la première anecdote publiée, ce qui laissait encore changer de
#     camp tant qu'on n'avait rien publié — donc jusqu'à connaître le gagnant.
TEAM_A=$(q "INSERT INTO competition_teams (competition_id,name) VALUES ('$PUB','Rouge') RETURNING id")
TEAM_B=$(q "INSERT INTO competition_teams (competition_id,name) VALUES ('$PUB','Bleue') RETURNING id")

check "entré sans équipe, on n'est pas encore verrouillé" "absent" \
  "$(q "SELECT CASE WHEN locked_at IS NULL THEN 'absent' ELSE 'posé' END FROM competition_members WHERE user_id='$C_MEMBER' AND competition_id='$PUB'")"
as authenticated "$C_MEMBER" "UPDATE competition_members SET team_id='$TEAM_A' WHERE competition_id='$PUB' AND user_id='$C_MEMBER';" >/dev/null 2>&1 || true
check "on choisit son camp une première fois" "Rouge" \
  "$(q "SELECT t.name FROM competition_members m JOIN competition_teams t ON t.id=m.team_id WHERE m.user_id='$C_MEMBER' AND m.competition_id='$PUB'")"
check "choisir son camp pose le verrou sur-le-champ" "posé" \
  "$(q "SELECT CASE WHEN locked_at IS NULL THEN 'absent' ELSE 'posé' END FROM competition_members WHERE user_id='$C_MEMBER' AND competition_id='$PUB'")"
as authenticated "$C_MEMBER" "UPDATE competition_members SET team_id='$TEAM_B' WHERE competition_id='$PUB' AND user_id='$C_MEMBER';" >/dev/null 2>&1 || true
check "une fois verrouillé, on ne change plus d'équipe" "Rouge" \
  "$(q "SELECT t.name FROM competition_members m JOIN competition_teams t ON t.id=m.team_id WHERE m.user_id='$C_MEMBER' AND m.competition_id='$PUB'")"

# Rejoindre EN choisissant son camp : le chemin normal depuis l'écran, et le
# seul moment où le choix est vraiment libre. Le verrou doit tomber à l'entrée.
C_JOINER=$(q "INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id")
as authenticated "$C_JOINER" "INSERT INTO competition_members (competition_id,user_id,team_id) VALUES ('$PUB','$C_JOINER','$TEAM_B');" >/dev/null 2>&1 || true
check "rejoindre avec son camp verrouille à l'inscription" "posé" \
  "$(q "SELECT CASE WHEN locked_at IS NULL THEN 'absent' ELSE 'posé' END FROM competition_members WHERE user_id='$C_JOINER' AND competition_id='$PUB'")"
as authenticated "$C_JOINER" "UPDATE competition_members SET team_id='$TEAM_A' WHERE competition_id='$PUB' AND user_id='$C_JOINER';" >/dev/null 2>&1 || true
check "et ne laisse plus changer ensuite" "Bleue" \
  "$(q "SELECT t.name FROM competition_members m JOIN competition_teams t ON t.id=m.team_id WHERE m.user_id='$C_JOINER' AND m.competition_id='$PUB'")"

TPOST_M=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration,competition_day_id) VALUES ('$C_MEMBER','Mienne','u',10,'$TODAYDAY') RETURNING id")

# --- Le vote du jour : une voix, sur l'urne ouverte, et jamais pour soi.
TPOST_2=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration,competition_day_id) VALUES ('$C_MEMBER2','Autre','u',10,'$TODAYDAY') RETURNING id")
PASTPOST=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration,competition_day_id) VALUES ('$C_MEMBER2','Hier','u',10,'$PASTDAY') RETURNING id")
OFFPOST=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration) VALUES ('$C_MEMBER2','hors','u',10) RETURNING id")

as authenticated "$C_MEMBER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$TODAYDAY','$C_MEMBER','$TPOST_M');" >/dev/null 2>&1 || true
check "voter pour soi-même refusé" "0" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"

as authenticated "$C_MEMBER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$TODAYDAY','$C_MEMBER','$TPOST_2');" >/dev/null 2>&1 || true
check "un membre vote une fois" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"
as authenticated "$C_MEMBER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$TODAYDAY','$C_MEMBER','$TPOST_2');" >/dev/null 2>&1 || true
check "deux votes le même jour refusés" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"
as authenticated "$C_OUT" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$TODAYDAY','$C_OUT','$TPOST_2');" >/dev/null 2>&1 || true
check "un non-membre ne vote pas" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"
as authenticated "$C_MEMBER2" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$TODAYDAY','$C_MEMBER2','$OFFPOST');" >/dev/null 2>&1 || true
check "voter pour une anecdote hors compétition refusé" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"

# L'urne d'hier est scellée : sinon un bonus déjà porté au classement du matin
# pourrait changer de main dans la journée.
check "l'urne d'hier est fermée" "f" "$(q "SELECT competition_day_is_open('$PASTDAY')")"
check "l'urne du jour est ouverte" "t" "$(q "SELECT competition_day_is_open('$TODAYDAY')")"
as authenticated "$C_MEMBER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$PASTDAY','$C_MEMBER','$PASTPOST');" >/dev/null 2>&1 || true
check "voter sur un jour dépouillé refusé" "0" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$PASTDAY'")"

# Déplacer sa voix vers l'anecdote d'un autre jour : le WITH CHECK explicite
# de la politique UPDATE est ce qui l'interdit.
as authenticated "$C_MEMBER" "UPDATE competition_votes SET post_id='$PASTPOST' WHERE voter_id='$C_MEMBER' AND day_id='$TODAYDAY';" >/dev/null 2>&1 || true
check "déplacer sa voix vers un autre jour refusé" "$TPOST_2" \
  "$(q "SELECT post_id FROM competition_votes WHERE voter_id='$C_MEMBER' AND day_id='$TODAYDAY'")"
as authenticated "$C_MEMBER" "DELETE FROM competition_votes WHERE voter_id='$C_MEMBER' AND day_id='$TODAYDAY';" >/dev/null 2>&1 || true
check "on peut retirer sa voix" "0" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"

# Le bouton « Voter » passe par un upsert PostgREST, donc un INSERT ... ON
# CONFLICT DO UPDATE : il traverse À LA FOIS la politique d'insertion et celle
# de mise à jour. Tester les deux séparément ne prouve pas que le chemin réel
# passe — et c'est le seul chemin qu'empruntent les utilisateurs.
TPOST_2BIS=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration,competition_day_id) VALUES ('$C_MEMBER2','Autre bis','u',10,'$TODAYDAY') RETURNING id")
UPSERT="INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$TODAYDAY','$C_MEMBER',"
as authenticated "$C_MEMBER" "$UPSERT'$TPOST_2') ON CONFLICT (day_id,voter_id) DO UPDATE SET post_id=EXCLUDED.post_id;" >/dev/null 2>&1 || true
check "l'upsert du bouton Voter passe" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$TODAYDAY'")"
as authenticated "$C_MEMBER" "$UPSERT'$TPOST_2BIS') ON CONFLICT (day_id,voter_id) DO UPDATE SET post_id=EXCLUDED.post_id;" >/dev/null 2>&1 || true
check "l'upsert déplace la voix sans en créer une seconde" "$TPOST_2BIS" \
  "$(q "SELECT post_id FROM competition_votes WHERE voter_id='$C_MEMBER' AND day_id='$TODAYDAY'")"
as authenticated "$C_MEMBER" "$UPSERT'$TPOST_M') ON CONFLICT (day_id,voter_id) DO UPDATE SET post_id=EXCLUDED.post_id;" >/dev/null 2>&1 || true
check "l'upsert ne permet pas de basculer sur sa propre anecdote" "$TPOST_2BIS" \
  "$(q "SELECT post_id FROM competition_votes WHERE voter_id='$C_MEMBER' AND day_id='$TODAYDAY'")"
q "DELETE FROM competition_votes WHERE day_id='$TODAYDAY'" >/dev/null


# --- Le dépouillement dans la vue : les ex æquo gagnent tous.
q "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$PASTDAY','$C_MEMBER','$PASTPOST')" >/dev/null
check "un jour dépouillé crédite son gagnant" "1" \
  "$(q "SELECT day_wins FROM competition_player_scores WHERE competition_id='$PUB' AND user_id='$C_MEMBER2'")"
check "le jour en cours ne crédite encore personne" "0" \
  "$(q "SELECT day_wins FROM competition_player_scores WHERE competition_id='$PUB' AND user_id='$C_MEMBER'")"

DONE=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Finie','public',CURRENT_DATE-10,CURRENT_DATE-1) RETURNING id")
as authenticated "$C_OUT" "INSERT INTO competition_members (competition_id,user_id) VALUES ('$DONE','$C_OUT');" >/dev/null 2>&1 || true
check "on ne rejoint pas une compétition finie" "0" "$(q "SELECT count(*) FROM competition_members WHERE competition_id='$DONE'")"

# --- Le barème : réglable avant le départ, gelé après.
as authenticated "$C_OWNER" "UPDATE competitions SET scoring='{\"members\":9,\"posts\":5,\"likes\":1,\"comments\":2,\"shares\":3,\"bonus\":20}'::jsonb WHERE id='$PUB';" >/dev/null 2>&1 || true
check "le barème est gelé depuis le départ" "1" "$(q "SELECT scoring->>'members' FROM competitions WHERE id='$PUB'")"
SOON=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','À venir','public',CURRENT_DATE+3,CURRENT_DATE+5) RETURNING id")
as authenticated "$C_OWNER" "UPDATE competitions SET scoring='{\"members\":9,\"posts\":5,\"likes\":1,\"comments\":2,\"shares\":3,\"bonus\":20}'::jsonb WHERE id='$SOON';" >/dev/null 2>&1 || true
check "le barème se règle avant le départ" "9" "$(q "SELECT scoring->>'members' FROM competitions WHERE id='$SOON'")"
as authenticated "$C_OWNER" "UPDATE competitions SET prize='une soirée' WHERE id='$PUB';" >/dev/null 2>&1 || true
check "le reste des réglages passe malgré le gel" "une soirée" "$(q "SELECT prize FROM competitions WHERE id='$PUB'")"

# --- Les équipes, après la création : elles n'étaient réglables qu'au moment
#     de créer, et une faute de frappe obligeait à refaire la compétition.
as authenticated "$C_OWNER" "INSERT INTO competition_teams (competition_id,name) VALUES ('$PUB','Verte');" >/dev/null 2>&1 || true
check "le propriétaire ajoute une équipe après coup" "1" "$(q "SELECT count(*) FROM competition_teams WHERE competition_id='$PUB' AND name='Verte'")"
as authenticated "$C_OWNER" "UPDATE competition_teams SET name='Jaune' WHERE competition_id='$PUB' AND name='Verte';" >/dev/null 2>&1 || true
check "le propriétaire renomme une équipe" "1" "$(q "SELECT count(*) FROM competition_teams WHERE competition_id='$PUB' AND name='Jaune'")"
as authenticated "$C_MEMBER" "INSERT INTO competition_teams (competition_id,name) VALUES ('$PUB','Pirate');" >/dev/null 2>&1 || true
check "un simple membre ne crée pas d'équipe" "0" "$(q "SELECT count(*) FROM competition_teams WHERE competition_id='$PUB' AND name='Pirate'")"
# Supprimer une équipe ne supprime personne : ses joueurs repassent en solo.
as authenticated "$C_OWNER" "DELETE FROM competition_teams WHERE id='$TEAM_A';" >/dev/null 2>&1 || true
check "supprimer une équipe laisse ses joueurs en solo" "1" \
  "$(q "SELECT count(*) FROM competition_members WHERE user_id='$C_MEMBER' AND competition_id='$PUB' AND team_id IS NULL")"

# --- Le code d'invitation : garanti par la base, pas par le client.
#     Il n'était donné qu'aux privées, si bien qu'une publique n'avait rien à
#     partager — et il n'était affiché nulle part.
check "une compétition publique reçoit un code" "6" \
  "$(q "SELECT coalesce(length(join_code),0) FROM competitions WHERE id='$PUB'")"
check "les codes sont uniques" "0" \
  "$(q "SELECT count(*) FROM (SELECT join_code FROM competitions WHERE join_code IS NOT NULL GROUP BY join_code HAVING count(*)>1) x")"

as authenticated "$C_MEMBER" "INSERT INTO competition_templates (key,name) VALUES ('pirate','Pirate');" >/dev/null 2>&1 || true
check "personne ne crée de modèle" "0" "$(q "SELECT count(*) FROM competition_templates WHERE key='pirate'")"

# Une notification système n'a pas d'auteur ; actor_id doit l'accepter.
q "INSERT INTO notifications (user_id,type) VALUES ('$C_OWNER','competition_day')" >/dev/null 2>&1
check "une notification système passe sans auteur" "1" \
  "$(q "SELECT count(*) FROM notifications WHERE type='competition_day'")"

echo
if [ "$failures" -eq 0 ]; then
  echo "✅ Tout est bon."
else
  echo "❌ $failures vérification(s) en échec."
  exit 1
fi
