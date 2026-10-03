#!/usr/bin/env bash
# Prueba de las copias de seguridad (ADR-0017) con Docker: un PostgreSQL con
# datos, un bucket S3 de prueba (rclone serve s3), un volcado y su
# restauración de prueba. La ejecuta la CI y se puede ejecutar en local:
#   infra/copias/prueba-local.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

network="copias-prueba-$$"
image="logicflows-backup:prueba"
key="prueba"
secret="secreto-de-prueba"
cleanup() {
  docker rm -f "$network-postgres" "$network-s3" > /dev/null 2>&1 || true
  docker network rm "$network" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker build --quiet --target backup -t "$image" . > /dev/null
docker network create "$network" > /dev/null
docker run -d --name "$network-postgres" --network "$network" \
  -e POSTGRES_PASSWORD=admin postgres:18.6 > /dev/null
docker run -d --name "$network-s3" --network "$network" rclone/rclone:1.71.2 \
  serve s3 --addr :9000 --auth-key "$key,$secret" /data > /dev/null

psql() {
  docker exec -i "$network-postgres" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"
}
for _ in $(seq 1 30); do
  psql -c 'select 1' > /dev/null 2>&1 && break
  sleep 1
done
psql -c 'create database logicflows' -c 'create database keycloak'
psql -d logicflows <<'SQL'
create table telemetry_samples (id bigint primary key, boxes_total integer not null);
insert into telemetry_samples select n, n * 2 from generate_series(1, 5000) as n;
create table cell_hourly (hour timestamptz primary key, boxes integer not null);
insert into cell_hourly values ('2026-10-03T08:00:00Z', 900), ('2026-10-03T09:00:00Z', 850);
SQL
psql -d keycloak -c 'create table realm (id text primary key)' -c "insert into realm values ('logicflows')"

backup() {
  docker run --rm --network "$network" \
    -e PGHOST="$network-postgres" -e PGUSER=postgres -e PGPASSWORD=admin \
    -e COPIAS_S3_ENDPOINT="http://$network-s3:9000" -e COPIAS_S3_BUCKET=copias \
    -e COPIAS_S3_ACCESS_KEY_ID="$key" -e COPIAS_S3_SECRET_ACCESS_KEY="$secret" \
    "$@"
}
docker exec "$network-s3" mkdir -p /data/copias

echo '— Volcado'
output="$(backup "$image")"
echo "$output"
grep -q COPIA-COMPLETADA <<< "$output"

echo '— Restauración de prueba'
output="$(backup "$image" /opt/copias/probar-restauracion.sh)"
echo "$output"
grep -q RESTAURACION-COMPLETADA <<< "$output"
grep -q 'muestras de telemetría: 5000' <<< "$output"
grep -q 'horas agregadas: 2' <<< "$output"

echo '— Sin copia de una base de datos, la prueba falla'
if output="$(backup -e COPIAS_BASES='logicflows otra' "$image" /opt/copias/probar-restauracion.sh 2>&1)"; then
  echo "La restauración de prueba no detectó la copia que falta" >&2
  exit 1
fi
grep -q 'no hay ninguna copia de otra' <<< "$output"

echo '— Con una copia antigua, la prueba falla'
if output="$(backup -e COPIAS_ANTIGUEDAD_MAXIMA_HORAS=0 "$image" /opt/copias/probar-restauracion.sh 2>&1)"; then
  echo "La restauración de prueba aceptó una copia antigua" >&2
  exit 1
fi
grep -q 'tiene 0 horas' <<< "$output"

echo 'Prueba de las copias de seguridad: correcta'
