#!/usr/bin/env bash
# ============================================================================
# Restauration d'une sauvegarde d'une pile Supabase locale.
#
# Usage :
#   ./scripts/db_restore.sh <archive>
#
# L'archive est le répertoire produit par db_backup.sh (contient schema.sql +
# data.sql). La procédure est :
#   1. `supabase db reset`  → base fraîche (migrations + seeds de la version courante)
#   2. `supabase db query --local -f data.sql` → remise des données
#   3. vérification des comptages
#
# Note : le fichier schema.sql est conservé dans l'archive, mais n'est pas
# ré-appliqué à la restauration : les objets schema sont déjà recréés par les
# migrations durant `db reset`.
# ============================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROG="$(basename "$0")"

if [ "$#" -ne 1 ]; then
  echo "ERREUR: usage : $PROG <archive>" >&2
  exit 1
fi

ARCHIVE="$1"

if [ ! -d "$ARCHIVE" ]; then
  echo "ERREUR: archive introuvable : $ARCHIVE" >&2
  exit 1
fi

if [ ! -f "$ARCHIVE/data.sql" ]; then
  echo "ERREUR: $ARCHIVE/data.sql manquant (archive invalide)" >&2
  exit 1
fi

# ── 1. Vérifications préalables ───────────────────────────────────────────
if ! DBURL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2-)"; then
  echo "ERREUR: pile Supabase locale introuvable. Lancez : npx supabase start" >&2
  exit 1
fi
if ! supabase db query --local -c "SELECT 1" >/dev/null 2>&1; then
  echo "ERREUR: la base locale n'est pas joignable. Lancez : npx supabase start" >&2
  exit 1
fi

# ── 2. Base fraîche (migrations + seeds) ──────────────────────────────────
echo "== db reset → base fraîche =="
supabase db reset

# `db reset` peut stopper les services Docker ; on s'assure qu'ils sont de
# nouveau up avant toute ouverture de session.
if ! supabase db query --local -c "SELECT 1" >/dev/null 2>&1; then
  echo "== services arrêtés après db reset → redémarrage =="
  supabase start
fi

# ── 3. Restauration des données ───────────────────────────────────────────
echo "== restauration des données depuis $ARCHIVE/data.sql =="
if ! supabase db query --local -f "$ARCHIVE/data.sql"; then
  echo "ERREUR: échec de la restauration" >&2
  exit 1
fi

# ── 4. Vérification ───────────────────────────────────────────────────────
echo "== vérification =="
supabase db query --local -f - <<'SQL'
  SELECT 'tenants'            AS tbl, count(*) FROM public.tenants
  UNION ALL SELECT 'roles'      AS tbl, count(*) FROM public.roles
  UNION ALL SELECT 'workflows'  AS tbl, count(*) FROM public.workflow_definitions
  UNION ALL SELECT 'requirements' AS tbl, count(*) FROM public.requirements
  UNION ALL SELECT 'auth.users' AS tbl, count(*) FROM auth.users;
SQL

echo "Restauration terminée."
