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
# lot : sans elles, on réécrit un thème après coup, on vote deux fois, ou on
# rejoint l'équipe qui gagne la veille de la clôture.
echo "▸ Compétitions"
C_OWNER="$OWNER"
C_MEMBER="$INTRUDER"
C_OUT=$(q "INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id")

PRIV=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Privée','private',CURRENT_DATE,CURRENT_DATE+7) RETURNING id")
PUB=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Publique','public',CURRENT_DATE,CURRENT_DATE+7) RETURNING id")
q "INSERT INTO competition_members (competition_id,user_id) VALUES ('$PRIV','$C_MEMBER'),('$PUB','$C_MEMBER'),('$PUB','$C_OWNER')" >/dev/null

check "un membre voit la compétition privée" "1" \
  "$(as authenticated "$C_MEMBER" "SELECT count(*) FROM competitions WHERE id='$PRIV';" 2>/dev/null)"
check "un étranger ne voit pas la privée" "0" \
  "$(as authenticated "$C_OUT" "SELECT count(*) FROM competitions WHERE id='$PRIV';" 2>/dev/null)"
check "tout le monde voit la publique" "1" \
  "$(as authenticated "$C_OUT" "SELECT count(*) FROM competitions WHERE id='$PUB';" 2>/dev/null)"

PASTDAY=$(q "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$PUB',1,'Hier',CURRENT_DATE-1) RETURNING id")
FUTDAY=$(q "INSERT INTO competition_days (competition_id,day_index,theme,date) VALUES ('$PUB',2,'Demain',CURRENT_DATE+1) RETURNING id")
as authenticated "$C_OWNER" "UPDATE competition_days SET theme='réécrit' WHERE id='$PASTDAY';" >/dev/null 2>&1 || true
check "le thème d'un jour passé ne se réécrit pas" "Hier" "$(q "SELECT theme FROM competition_days WHERE id='$PASTDAY'")"
as authenticated "$C_OWNER" "UPDATE competition_days SET theme='ajusté' WHERE id='$FUTDAY';" >/dev/null 2>&1 || true
check "un jour à venir reste modifiable" "ajusté" "$(q "SELECT theme FROM competition_days WHERE id='$FUTDAY'")"
as authenticated "$C_MEMBER" "UPDATE competition_days SET theme='pirate' WHERE id='$FUTDAY';" >/dev/null 2>&1 || true
check "un simple membre ne touche pas aux thèmes" "ajusté" "$(q "SELECT theme FROM competition_days WHERE id='$FUTDAY'")"

CPOST=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration,competition_day_id) VALUES ('$C_MEMBER','a','u',10,'$FUTDAY') RETURNING id")
OFFPOST=$(q "INSERT INTO voice_posts (user_id,title,audio_url,duration) VALUES ('$C_MEMBER','hors','u',10) RETURNING id")

as authenticated "$C_OWNER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$FUTDAY','$C_OWNER','$CPOST');" >/dev/null 2>&1 || true
check "un membre vote une fois" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$FUTDAY'")"
as authenticated "$C_OWNER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$FUTDAY','$C_OWNER','$CPOST');" >/dev/null 2>&1 || true
check "deux votes le même jour refusés" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$FUTDAY'")"
as authenticated "$C_OUT" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$FUTDAY','$C_OUT','$CPOST');" >/dev/null 2>&1 || true
check "un non-membre ne vote pas" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$FUTDAY'")"
as authenticated "$C_MEMBER" "INSERT INTO competition_votes (competition_id,day_id,voter_id,post_id) VALUES ('$PUB','$FUTDAY','$C_MEMBER','$OFFPOST');" >/dev/null 2>&1 || true
check "voter pour une anecdote d'un autre jour refusé" "1" "$(q "SELECT count(*) FROM competition_votes WHERE day_id='$FUTDAY'")"

DONE=$(q "INSERT INTO competitions (owner_id,name,visibility,starts_on,ends_on) VALUES ('$C_OWNER','Finie','public',CURRENT_DATE-10,CURRENT_DATE-1) RETURNING id")
as authenticated "$C_OUT" "INSERT INTO competition_members (competition_id,user_id) VALUES ('$DONE','$C_OUT');" >/dev/null 2>&1 || true
check "on ne rejoint pas une compétition finie" "0" "$(q "SELECT count(*) FROM competition_members WHERE competition_id='$DONE'")"

TEAM_A=$(q "INSERT INTO competition_teams (competition_id,name) VALUES ('$PUB','Rouge') RETURNING id")
TEAM_B=$(q "INSERT INTO competition_teams (competition_id,name) VALUES ('$PUB','Bleue') RETURNING id")
as authenticated "$C_MEMBER" "UPDATE competition_members SET team_id='$TEAM_A' WHERE competition_id='$PUB' AND user_id='$C_MEMBER';" >/dev/null 2>&1 || true
check "on choisit son équipe tant qu'on n'a pas marqué" "Rouge" \
  "$(q "SELECT t.name FROM competition_members m JOIN competition_teams t ON t.id=m.team_id WHERE m.user_id='$C_MEMBER' AND m.competition_id='$PUB'")"
q "UPDATE competition_members SET locked_at=now() WHERE competition_id='$PUB' AND user_id='$C_MEMBER'" >/dev/null
as authenticated "$C_MEMBER" "UPDATE competition_members SET team_id='$TEAM_B' WHERE competition_id='$PUB' AND user_id='$C_MEMBER';" >/dev/null 2>&1 || true
check "une fois verrouillé, on ne change plus d'équipe" "Rouge" \
  "$(q "SELECT t.name FROM competition_members m JOIN competition_teams t ON t.id=m.team_id WHERE m.user_id='$C_MEMBER' AND m.competition_id='$PUB'")"

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
