#!/usr/bin/env bash
#
# La répétition générale : une compétition de test montée de bout en bout, et
# les deux classements comparés à un calcul fait à la main.
#
# C'est le seul contrôle qui prouve que la vue SQL et la formule TypeScript
# disent la même chose. Il demande un Postgres joignable par les variables PG*
# habituelles, comme ./scripts/verify-migrations.sh.
#
#   ./scripts/repetition-generale.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
DB="vocme_repetition_$$"
VIEW="${TMPDIR:-/tmp}/vocme-view.$$.json"

cleanup() {
  psql -d postgres -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true
  rm -f "$VIEW"
}
trap cleanup EXIT

echo ""
echo "Répétition générale — compétition de test, trois équipes"
echo ""

psql -d postgres -q -c "CREATE DATABASE $DB" >/dev/null
psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/supabase-stub.sql" >/dev/null 2>&1

for f in $(ls "$ROOT"/supabase/migrations/*.sql | sort); do
  if ! psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/tmp/rep.$$ 2>&1; then
    echo "  ❌ migration refusée : $(basename "$f")"
    cat /tmp/rep.$$
    rm -f /tmp/rep.$$
    exit 1
  fi
done
rm -f /tmp/rep.$$
echo "  ✅ chaîne de migrations rejouée"

psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$HERE/repetition/competition.sql" >/dev/null
psql -d "$DB" -q -tAc \
  "COPY (SELECT json_agg(row_to_json(s)) FROM competition_player_scores s) TO STDOUT" > "$VIEW"

npx --yes tsx "$HERE/repetition/comparer.ts" "$VIEW"

# Le modèle mariage sur le même moteur : deux camps, trois jours, sans école.
# S'il demandait la moindre ligne de code, le moteur ne serait pas générique et
# il faudrait le corriger avant le premier défi, pas après.
echo "  Le modèle mariage, sur le même moteur"
npx --yes tsx "$HERE/repetition/modeles.ts" mariage | psql -d "$DB" -v ON_ERROR_STOP=1 -q

expect() {
  local label="$1" want="$2" got
  got=$(psql -d "$DB" -q -tAc "$3")
  if [ "$got" = "$want" ]; then
    echo "  ✅ $label — $got"
  else
    echo "  ❌ $label (attendu «$want», obtenu «$got»)"
    exit 1
  fi
}

expect "les quatre modèles sont posés" "4" "SELECT count(*) FROM competition_templates"
expect "trois jours, sans durée en dur" "3" \
  "SELECT count(*) FROM competition_days d JOIN competitions c ON c.id=d.competition_id WHERE c.template_key='mariage'"
expect "deux camps, aucune école" "Team mariée, Team marié" \
  "SELECT string_agg(t.name, ', ' ORDER BY t.name DESC) FROM competition_teams t JOIN competitions c ON c.id=t.competition_id WHERE c.template_key='mariage'"
expect "les coefficients viennent du modèle" "2" \
  "SELECT (scoring->>'likes')::int FROM competitions WHERE template_key='mariage'"
# Le score attendu, calculé à la main avec les coefficients du modèle mariage :
# 1 point de membre + 5 pour l'anecdote + 2 pour le like = 8, pour chaque invité.
expect "le classement du mariage produit un vrai score" "8|8" \
  "SELECT string_agg(score::int::text,'|' ORDER BY user_id) FROM competition_player_scores s JOIN competitions c ON c.id=s.competition_id WHERE c.template_key='mariage'"
expect "chaque camp compte son invité" "1|1" \
  "SELECT string_agg(n::text,'|' ORDER BY n) FROM (SELECT count(*) n FROM competition_player_scores s JOIN competitions c ON c.id=s.competition_id WHERE c.template_key='mariage' GROUP BY s.team_id) x"

echo ""
echo "✅ Les deux classements s'accordent, et le mariage tourne sur le même moteur."
echo ""
