# Servicios temporales de Railway para cargar datos simulados (ADR-0019,
# LF-123). Lo cargan cargar-ventana.sh y anadir-celulas.sh, que definen antes
# `environment` y `region`. Los servicios se borran al salir.
# shellcheck shell=bash

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
    --variables 'SIMULATOR_CELLS=${{simulator.SIMULATOR_CELLS}}'
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
  # Hasta una hora: la carga de varias células va una detrás de otra (LF-123).
  for _ in $(seq 1 360); do
    sleep 10
    logs="$(railway logs --service "$service" --deployment 2> /dev/null || true)"
    if grep -qE "$marker|\[(ERRO|FATAL)\]|Error:" <<< "$logs"; then
      break
    fi
  done
  if ! grep -q "$marker" <<< "$logs"; then
    grep -vE '^\s*$' <<< "$logs" | tail -20
    echo "El paso no terminó." >&2
    exit 1
  fi
}

