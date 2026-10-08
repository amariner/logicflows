#!/usr/bin/env bash
# Añade células simuladas a un entorno de Railway sin borrar el histórico de
# las que ya tiene (LF-123).
#
# Uso: infra/railway/anadir-celulas.sh <entorno> <células> [días]
#   <células>: todas las del simulador, en orden, como en SIMULATOR_CELLS
#              (cell-01,cell-02,cell-03,cell-04). Las que ya simula van primero.
#
# La API descarta una sesión anterior a la última que conoce de una célula
# (ADR-0004), así que el histórico de una célula nueva se carga antes de que la
# simule el simulador en directo:
#   1. Genera los días de las células nuevas con su perfil, en un servicio
#      temporal con la imagen desplegada (servicio-temporal.sh).
#   2. Espera a que la API lo guarde.
#   3. Cambia SIMULATOR_CELLS del simulador, que se vuelve a desplegar con
#      todas las células.
#
# El simulador desplegado debe admitir varias células (desde LF-123).
set -euo pipefail

environment="${1:?Falta el entorno}"
cells="${2:?Faltan las células}"
days="${3:-31}"
region="europe-west4-drams3a"
here="$(cd "$(dirname "$0")" && pwd)"
version="$(sed -n "s/^const VERSION = '\(.*\)';$/\1/p" "$here/../../.railway/railway.ts")"

# shellcheck source=servicio-temporal.sh
source "$here/servicio-temporal.sh"
trap cleanup EXIT

railway environment "$environment" > /dev/null

variables="$(railway variables --service simulator --environment "$environment" --kv)"
current="$(sed -n 's/^SIMULATOR_CELLS=//p' <<< "$variables")"
if [ -z "$current" ]; then
  current="$(sed -n 's/^SIMULATOR_CELL_ID=//p' <<< "$variables")"
fi
if [[ "$cells" != "$current",* ]]; then
  echo "Las células deben empezar por las que ya simula ($current) y añadir alguna." >&2
  exit 2
fi
new="${cells#"$current",}"

echo "1/3 Generando $days días de $new ($version)…"
run_temporary celulas "ghcr.io/amariner/logicflows-simulator:$version" \
  "sh -c 'node dist/backfill-main.js && echo CARGA-COMPLETADA'" CARGA-COMPLETADA \
  'SIMULATOR_SEED=${{simulator.SIMULATOR_SEED}}' 'SIMULATOR_SCENARIO=${{simulator.SIMULATOR_SCENARIO}}' \
  "SIMULATOR_CELLS=$cells" "SIMULATOR_BACKFILL_CELLS=$new" "SIMULATOR_BACKFILL_DAYS=$days"

# Como en cargar-ventana.sh: la carga va más despacio de lo que guarda la API,
# así que al terminar solo le queda lo último.
wait_s=120
echo "2/3 Esperando ${wait_s} s a que la API lo guarde…"
sleep "$wait_s"

echo "3/3 Simulando en directo $cells…"
railway variables --service simulator --environment "$environment" --set "SIMULATOR_CELLS=$cells" > /dev/null
echo "Células añadidas."
