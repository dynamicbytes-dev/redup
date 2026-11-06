#!/usr/bin/env bash
# Prepara una base local/CI desde cero.
#
# El CLI de Supabase arranca las migraciones con el rol `postgres`, pero en el
# stack local `realtime.messages` pertenece a `supabase_realtime_admin`. La
# migración 20261103000010 necesita esa ownership para habilitar RLS. Este
# script arranca el stack sin migraciones, concede la membresía heredada a
# `postgres` usando `supabase_admin` (solo dentro del contenedor local) y
# después aplica todas las migraciones.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONFIG="supabase/config.toml"
PROJECT_ID="$(awk -F'"' '/^project_id/ { print $2; exit }' "$CONFIG")"
CONTAINER="supabase_db_${PROJECT_ID}"
BACKUP="$(mktemp)"
cp "$CONFIG" "$BACKUP"

restore_config() {
  cp "$BACKUP" "$CONFIG"
  rm -f "$BACKUP"
}
trap restore_config EXIT

python3 - "$CONFIG" <<'PY'
import re
import sys

path = sys.argv[1]
text = open(path, encoding="utf-8").read()

def disable(section: str) -> None:
    global text
    pattern = rf'(\[{re.escape(section)}\]\n(?:#[^\n]*\n)*)enabled = true'
    text, count = re.subn(pattern, r'\1enabled = false', text, count=1)
    if count != 1:
        raise SystemExit(f"No se pudo desactivar {section}")

disable("db.migrations")
disable("db.seed")
open(path, "w", encoding="utf-8").write(text)
PY

echo "Iniciando Supabase sin migraciones ni seed..."
npx supabase start --ignore-health-check

echo "Esperando a que Postgres esté listo..."
for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Concediendo a postgres la membresía de supabase_realtime_admin..."
docker exec "$CONTAINER" psql -U supabase_admin -d postgres \
  -c "grant supabase_realtime_admin to postgres;"

restore_config
trap - EXIT

echo "Aplicando migraciones..."
npx supabase migration up

if [[ "${1:-}" == "--seed" ]]; then
  echo "Cargando seed local..."
  docker exec -i "$CONTAINER" psql -U postgres -d postgres < supabase/seed.sql
fi

echo "Base local lista."
