#!/usr/bin/env bash
# Restauración de prueba de las últimas copias (ADR-0017). Para cada base de
# datos, comprueba que su última copia es reciente, la restaura en un
# PostgreSQL desechable dentro del propio contenedor y comprueba sus tablas.
# Nunca se conecta a la base de datos de producción.
#
# Variables: las COPIAS_S3_* del bucket (s3.sh), COPIAS_BASES y
# COPIAS_ANTIGUEDAD_MAXIMA_HORAS (por defecto 26: una copia diaria y margen).
# Termina con RESTAURACION-COMPLETADA, o con un error que explica qué falta.
set -euo pipefail
source "$(dirname "$0")/s3.sh"
max_age_hours="${COPIAS_ANTIGUEDAD_MAXIMA_HORAS:-26}"

workdir="$(mktemp -d)"
chown postgres "$workdir"
port=5499
pg() { gosu postgres "$@"; }
stop() {
  pg pg_ctl -D "$workdir/data" -m immediate stop > /dev/null 2>&1 || true
  rm -rf "$workdir"
}
trap stop EXIT

pg initdb -D "$workdir/data" -U postgres --auth=trust > /dev/null
pg pg_ctl -D "$workdir/data" -w -l "$workdir/postgres.log" \
  -o "-p $port -k $workdir -c listen_addresses=''" start > /dev/null
psql_local() { pg psql -h "$workdir" -p "$port" -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }

total_started=$SECONDS
for database in $BASES; do
  latest="$(rclone lsf --files-only "$BUCKET/$database/" 2> /dev/null | sort | tail -1)"
  if [ -z "$latest" ]; then
    echo "ERROR: no hay ninguna copia de $database" >&2
    exit 1
  fi
  # Nombre: 2026-10-03T030000Z.dump
  stamp="${latest%.dump}"
  taken_at="$(date -u -d "${stamp:0:13}:${stamp:13:2}:${stamp:15:2}Z" +%s)"
  age_hours=$((($(date +%s) - taken_at) / 3600))
  if [ "$age_hours" -ge "$max_age_hours" ]; then
    echo "ERROR: la última copia de $database ($latest) tiene $age_hours horas" >&2
    exit 1
  fi

  started=$SECONDS
  rclone copyto "$BUCKET/$database/$latest" "$workdir/$database.dump"
  chown postgres "$workdir/$database.dump"
  psql_local -c "create database \"$database\"" > /dev/null
  pg pg_restore -h "$workdir" -p "$port" -U postgres --no-owner --no-acl --exit-on-error \
    --dbname="$database" "$workdir/$database.dump"
  tables="$(psql_local -d "$database" -c \
    "select count(*) from information_schema.tables where table_schema = 'public'")"
  if [ "$tables" -eq 0 ]; then
    echo "ERROR: la copia de $database no tiene tablas" >&2
    exit 1
  fi
  echo "Restauración de $database: $latest, de hace $age_hours h, $tables tablas, $((SECONDS - started)) s"
  if [ "$database" = logicflows ]; then
    psql_local -d logicflows -F ': ' -c "
      select 'muestras de telemetría', count(*) from telemetry_samples
      union all select 'horas agregadas', count(*) from cell_hourly"
  fi
done
echo "RESTAURACION-COMPLETADA en $((SECONDS - total_started)) s"
