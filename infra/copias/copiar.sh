#!/usr/bin/env bash
# Volcado lógico de las bases de datos de PostgreSQL en el bucket de las
# copias (ADR-0017). Se ejecuta a diario como servicio programado de Railway.
#
# Variables: las de conexión de libpq (PGHOST, PGPORT, PGUSER, PGPASSWORD),
# con un usuario que pueda leer todas las bases; las COPIAS_S3_* del bucket
# (s3.sh); COPIAS_BASES (por defecto «logicflows keycloak») y
# COPIAS_RETENCION_DIAS (por defecto 30).
#
# Cada copia se guarda como <base>/<fecha UTC>.dump, en el formato comprimido
# de pg_dump. Las de más de COPIAS_RETENCION_DIAS se borran después de subir
# la nueva, así que un fallo nunca deja el bucket sin copias.
set -euo pipefail
source "$(dirname "$0")/s3.sh"
retention="${COPIAS_RETENCION_DIAS:-30}"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

for database in $BASES; do
  started=$SECONDS
  pg_dump --format=custom --dbname="$database" --file="$workdir/$database.dump"
  size="$(stat -c %s "$workdir/$database.dump")"
  rclone copyto "$workdir/$database.dump" "$BUCKET/$database/$stamp.dump"
  echo "Copia de $database: $stamp.dump, $size bytes, $((SECONDS - started)) s"
done

rclone delete --min-age "${retention}d" "$BUCKET"
echo "COPIA-COMPLETADA $stamp"
