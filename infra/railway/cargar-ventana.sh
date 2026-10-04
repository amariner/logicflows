#!/usr/bin/env bash
# Carga la ventana de datos de la demo en un entorno de Railway (ADR-0019):
# vacía el histórico y lo vuelve a generar con el guion diario del simulador.
#
# Uso: infra/railway/cargar-ventana.sh <entorno> [días]
#
# Pasos, en este orden, porque la API descarta una sesión anterior a la que
# ya conoce (ADR-0004):
#   1. Detiene el simulador en directo.
#   2. Vacía el histórico (infra/postgres/vaciar-historico.sql).
#   3. Reinicia la API, que olvida las sesiones que conocía.
#   4. Genera los días con el histórico simulado en un servicio temporal, con
#      la imagen del simulador desplegada y sus credenciales por referencia.
#   5. Espera a que la API lo guarde y vuelve a arrancar el simulador.
#
# Borra datos: solo tiene sentido con datos simulados.
set -euo pipefail

environment="${1:?Falta el entorno}"
days="${2:-31}"
region="europe-west4-drams3a"
here="$(cd "$(dirname "$0")" && pwd)"
version="$(sed -n "s/^const VERSION = '\(.*\)';$/\1/p" "$here/../../.railway/railway.ts")"
service="ventana-$(date +%s)"

cleanup() {
  railway service delete --service "$service" --environment "$environment" --yes > /dev/null 2>&1 || true
}
trap cleanup EXIT

railway environment "$environment" > /dev/null
echo "1/5 Deteniendo el simulador…"
railway service scale --service simulator --environment "$environment" "$region=0" > /dev/null

echo "2/5 Vaciando el histórico…"
"$here/ejecutar-sql.sh" "$environment" "$here/../postgres/vaciar-historico.sql"

echo "3/5 Reiniciando la API…"
railway service redeploy --service api --yes > /dev/null
sleep 60

echo "4/5 Generando $days días con el guion ($version)…"
service_id="$(railway add --service "$service" \
  --image "ghcr.io/amariner/logicflows-simulator:$version" \
  --variables 'MQTT_URL=${{simulator.MQTT_URL}}' \
  --variables 'MQTT_SIMULATOR_PASSWORD=${{simulator.MQTT_SIMULATOR_PASSWORD}}' \
  --variables 'SIMULATOR_SITE_ID=${{simulator.SIMULATOR_SITE_ID}}' \
  --variables 'SIMULATOR_CELL_ID=${{simulator.SIMULATOR_CELL_ID}}' \
  --variables 'SIMULATOR_SEED=${{simulator.SIMULATOR_SEED}}' \
  --variables 'SIMULATOR_SCENARIO=guion' \
  --variables "SIMULATOR_BACKFILL_DAYS=$days" \
  --json 2> /dev/null | tail -1 | jq -r .id)"
environment_id="$(railway status --json | jq -r --arg name "$environment" \
  '.environments.edges[].node | select(.name == $name) | .id')"
command="sh -c 'node dist/backfill-main.js && echo CARGA-COMPLETADA'"
railway api 'mutation($s:String!,$e:String!,$c:String!){ serviceInstanceUpdate(serviceId:$s, environmentId:$e, input:{startCommand:$c, restartPolicyType:NEVER}) }' \
  --var s="$service_id" --var e="$environment_id" --var c="$command" > /dev/null
railway service scale --service "$service" "$region=1" sfo=0 > /dev/null
railway service redeploy --service "$service" --from-source --yes > /dev/null

# Como en ejecutar-sql.sh: se leen los registros enteros antes de buscar.
logs=""
for _ in $(seq 1 60); do
  sleep 10
  logs="$(railway logs --service "$service" --deployment 2> /dev/null || true)"
  if grep -qE 'CARGA-COMPLETADA|"level":"(error|fatal)"' <<< "$logs"; then
    break
  fi
done
grep -E 'Histórico simulado publicado|"level":"(error|fatal)"' <<< "$logs" || true
grep -q CARGA-COMPLETADA <<< "$logs"

# La API guarda unos 1 100 mensajes por segundo: 31 días son unos 270 000.
wait_s=$((days * 9000 / 1000 + 60))
echo "5/5 Esperando ${wait_s} s a que la API lo guarde y arrancando el simulador…"
sleep "$wait_s"
railway service scale --service simulator --environment "$environment" "$region=1" > /dev/null
echo "Ventana cargada."
