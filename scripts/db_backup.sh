#!/usr/bin/env bash
# ============================================================================
# Backup de la pile Supabase locale (schema + données).
#
# Usage :
#   ./scripts/db_backup.sh [OPTIONS] [DEST_DIR]
#
#   DEST_DIR  répertoire de destination (défaut : <repo>/backups)
#   --tag TAG étiquette libre (ex: v0.4.0) — affichée dans le nom de l'archive
#
# Archive produite (<dest>/<tag>-<horodatage>/) :
#   schema.sql  ← `supabase db dump --local` (tables, RLS, grants, permissions)
#   data.sql    ← `supabase db dump --local --data-only` (données, sans contraintes)
#
# Restauration  :  ./scripts/db_restore.sh <archive>
# ============================================================================
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

PROG="$(basename "$0")"
DEST=""
TAG=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag)
      shift
      TAG="${1:-}"
      ;;
    -*)
      echo "ERREUR: option inconnue: $1" >&2
      exit 1
      ;;
    *)
      if [ -n "$DEST" ]; then
        echo "ERREUR: trop d'arguments. Usage: $PROG [--tag TAG] [DEST_DIR]" >&2
        exit 1
      fi
      DEST="$1"
      ;;
  esac
  shift
done

: "${DEST:=$(pwd)/backups}"
: "${TAG:=local}"

# ── 1. Vérifications préalables ───────────────────────────────────────────
if ! DBURL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2-)"; then
  echo "ERREUR: pile Supabase locale introuvable. Lancez : npx supabase start" >&2
  exit 1
fi
if ! supabase db query --local -c "SELECT 1" >/dev/null 2>&1; then
  echo "ERREUR: la base locale n'est pas joignable. Lancez : npx supabase start" >&2
  exit 1
fi

if [ ! -d "$DEST" ]; then
  mkdir -p "$DEST" || { echo "ERREUR: Impossible de créer $DEST" >&2; exit 1; }
fi

TS="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="${DEST}/${TAG}-${TS}"
mkdir -p "$ARCHIVE" || { echo "ERREUR: impossible de créer $ARCHIVE" >&2; exit 1; }

echo "== Backup de la pile Supabase locale (depuis ${DBURL}) =="
echo "Archive : $ARCHIVE"

# ── 2. Schéma ─────────────────────────────────────────────────────────────
if ! supabase db dump --local -f "$ARCHIVE/schema.sql"; then
  echo "ERREUR: échec du dump de schéma" >&2
  exit 1
fi

# ── 3. Données ────────────────────────────────────────────────────────────
if ! supabase db dump --local --data-only -f "$ARCHIVE/data.sql"; then
  echo "ERREUR: échec du dump des données" >&2
  exit 1
fi

# ── 4. Résumé ─────────────────────────────────────────────────────────────
SCHEMA_LINES="$(wc -l < "$ARCHIVE/schema.sql")"
DATA_LINES="$(wc -l < "$ARCHIVE/data.sql")"
DATA_INSERTS="$(grep -c '^INSERT' "$ARCHIVE/data.sql" || true)"
SCHEMA_BYTES="$(stat -f%z "$ARCHIVE/schema.sql")"
DATA_BYTES="$(stat -f%z "$ARCHIVE/data.sql")"

echo "  schema.sql : ${SCHEMA_LINES} lignes, ${SCHEMA_BYTES} octets"
echo "  data.sql   : ${DATA_LINES} lignes, ${DATA_BYTES} octets, ${DATA_INSERTS} INSERT"
echo "  Sauvegarde conservée dans : $ARCHIVE"
