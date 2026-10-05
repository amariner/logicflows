#!/usr/bin/env bash
# Carga la ventana de datos de la demo en un entorno de Railway (ADR-0019):
# vacía el histórico y lo vuelve a generar con el guion diario del simulador.
#
# Uso: infra/railway/cargar-ventana.sh <entorno> [días]
#
# La API descarta una sesión anterior a la última que conoce (ADR-0004), y la
# conoce también por los mensajes retenidos que el broker le entrega al
# suscribirse. Por eso, en este orden:
#   1. Detiene el simulador en directo.
#   2. Borra sus mensajes retenidos en el broker.
#   3. Vacía el histórico (infra/postgres/vaciar-historico.sql).
#   4. Reinicia la API, que olvida las sesiones que conocía.
#   5. Genera los días con el histórico simulado.
#   6. Espera a que la API lo guarde y vuelve a arrancar el simulador.
# Los pasos 2 y 5 corren en servicios temporales de Railway, con las
# credenciales del simulador por referencia, que se borran al terminar.
#
# Borra datos: solo tiene sentido con datos simulados.
set -euo pipefail

environment="${1:?Falta el entorno}"
days="${2:-31}"
region="europe-west4-drams3a"
here="$(cd "$(dirname "$0")" && pwd)"
version="$(sed -n "s/^const VERSION = '\(.*\)';$/\1/p" "$here/../../.railway/railway.ts")"
temporary=()

cleanup() {
  for service in "${temporary[@]}"; do
    railway service delete --service "$service" --environment "$environment" --yes > /dev/null 2>&1 || true
  done
}
trap cleanup EXIT

# Ejecuta una orden en un servicio temporal y espera a que escriba `marker`.
#
# Railway arranca un servicio en cuanto se crea: con la imagen del simulador
# arrancaría el simulador en directo. Por eso se crea con una imagen que
# termina al instante y después se cambia todo de una vez, con un solo
# despliegue (escalar y redesplegar crearía dos).
run_temporary() {
  local name="$1" image="$2" command="$3" marker="$4" service service_id environment_id logs=""
  shift 4
  service="$name-$(date +%s)"
  temporary+=("$service")
  local variables=(
    --variables 'MQTT_URL=${{simulator.MQTT_URL}}'
    --variables 'MQTT_SIMULATOR_PASSWORD=${{simulator.MQTT_SIMULATOR_PASSWORD}}'
    --variables 'SIMULATOR_SITE_ID=${{simulator.SIMULATOR_SITE_ID}}'
    --variables 'SIMULATOR_CELL_ID=${{simulator.SIMULATOR_CELL_ID}}'
  )
  for variable in "$@"; do
    variables+=(--variables "$variable")
  done
  service_id="$(railway add --service "$service" --image busybox:1.37 "${variables[@]}" --json 2> /dev/null |
    tail -1 | jq -r .id)"
  environment_id="$(railway status --json | jq -r --arg name "$environment" \
    '.environments.edges[].node | select(.name == $name) | .id')"
  railway api 'mutation($s:String!,$e:String!,$i:String!,$c:String!,$r:String!){ serviceInstanceUpdate(serviceId:$s, environmentId:$e, input:{source:{image:$i}, startCommand:$c, restartPolicyType:NEVER, region:$r, numReplicas:1}) }' \
    --var s="$service_id" --var e="$environment_id" --var i="$image" --var c="$command" --var r="$region" > /dev/null
  railway service redeploy --service "$service" --environment "$environment" --from-source --yes > /dev/null
  # Como en ejecutar-sql.sh: se leen los registros enteros antes de buscar.
  for _ in $(seq 1 90); do
    sleep 10
    logs="$(railway logs --service "$service" --deployment 2> /dev/null || true)"
    if grep -qE "$marker|\[(ERRO|FATAL)\]|Error:" <<< "$logs"; then
      break
    fi
  done
  if ! grep -q "$marker" <<< "$logs"; then
    grep -vE '^\s*$' <<< "$logs" | tail -20
    echo "El paso no terminó. El simulador sigue detenido: se arranca con" >&2
    echo "  railway service scale --service simulator $region=1 us-west2=0" >&2
    exit 1
  fi
}

railway environment "$environment" > /dev/null

echo "1/6 Deteniendo el simulador…"
# Escalar a 0 réplicas no lo detiene: Railway lo vuelve a desplegar. Se retira
# su despliegue y, al final, se despliega de nuevo.
railway down --service simulator --environment "$environment" --yes > /dev/null 2>&1 || true

echo "2/6 Borrando sus mensajes retenidos…"
# Un mensaje retenido vacío borra el anterior.
run_temporary retenidos eclipse-mosquitto:2.1.2-alpine \
  "sh -c 'a=\${MQTT_URL#*://}; for k in status state telemetry; do mosquitto_pub -h \${a%:*} -p \${a##*:} -u simulator -P \"\$MQTT_SIMULATOR_PASSWORD\" -q 1 -r -n -t logicflows/v1/\$SIMULATOR_SITE_ID/\$SIMULATOR_CELL_ID/\$k || exit 1; done; echo RETENIDOS-BORRADOS'" \
  RETENIDOS-BORRADOS

echo "3/6 Vaciando el histórico…"
"$here/ejecutar-sql.sh" "$environment" "$here/../postgres/vaciar-historico.sql"

echo "4/6 Reiniciando la API…"
railway service redeploy --service api --environment "$environment" --yes > /dev/null
sleep 90

echo "5/6 Generando $days días con el guion ($version)…"
run_temporary ventana "ghcr.io/amariner/logicflows-simulator:$version" \
  "sh -c 'node dist/backfill-main.js && echo CARGA-COMPLETADA'" CARGA-COMPLETADA \
  'SIMULATOR_SEED=${{simulator.SIMULATOR_SEED}}' SIMULATOR_SCENARIO=guion "SIMULATOR_BACKFILL_DAYS=$days"

# En Railway, la API guarda unos 300 mensajes por segundo: 31 días, unos
# 270 000, tardan un cuarto de hora. El simulador puede arrancar antes: sus
# mensajes llegan a la API detrás del histórico, en orden.
wait_s=$((days * 9000 / 300 / 4 + 60))
echo "6/6 Esperando ${wait_s} s a que la API lo guarde y arrancando el simulador…"
sleep "$wait_s"
# Tras `railway down`, un despliegue nuevo va a la región por defecto (us-west2,
# comprobado el 5 de octubre de 2026): se fija la región, como en
# .railway/railway.ts, y eso ya lo vuelve a desplegar.
railway service scale --service simulator --environment "$environment" "$region=1" us-west2=0 > /dev/null
echo "Ventana cargada."
