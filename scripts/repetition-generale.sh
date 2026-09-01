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

echo "✅ Les deux classements s'accordent."
echo ""
