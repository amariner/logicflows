#!/usr/bin/env bash
# Espera a que los servicios indicados de un entorno de Railway tengan un
# despliegue correcto posterior a una fecha. `railway config apply` lanza los
# despliegues pero no espera a que terminen: sin esta espera, lo que venga
# después (la prueba de extremo a extremo) comprobaría la versión anterior.
#
#   infra/railway/esperar-despliegues.sh <entorno> <desde> <servicio>...
#
# <desde> es una fecha UTC (AAAA-MM-DDTHH:MM:SS), normalmente la de antes del
# apply. Si al cabo de un minuto un servicio no tiene despliegue nuevo, el
# cambio no le afectaba y vale el que tiene. Falla si un despliegue acaba en
# FAILED, CRASHED o REMOVED, o si en 15 minutos no ha terminado.
#
# Necesita la CLI de Railway con sesión iniciada, o RAILWAY_API_TOKEN con un
# token de cuenta, y jq.
set -euo pipefail

PROJECT_ID='ecd6658d-9825-4004-801a-64a28bc9f4a7'

environment="${1:-}"
since="${2:-}"
if [[ -z "$environment" || ! "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}$ || $# -lt 3 ]]; then
  echo "Uso: $0 <entorno> <desde AAAA-MM-DDTHH:MM:SS> <servicio>..." >&2
  exit 2
fi
shift 2

railway link --project "$PROJECT_ID" --environment "$environment" > /dev/null

# Un error al consultar no puede confundirse con «sigue desplegando».
services() {
  if ! railway service list --environment "$environment" --json; then
    echo "No se pueden consultar los servicios de Railway en $environment" >&2
    return 1
  fi
}

deadline=$((SECONDS + 900))
grace=$((SECONDS + 60))
while :; do
  expired=false
  [ "$SECONDS" -ge "$grace" ] && expired=true
  pending="$(services | jq -r --arg since "$since" --argjson grace "$expired" \
    --args '[$ARGS.positional[]] as $wanted
      | map(select(.name as $n | $wanted | index($n)))
      | ($wanted - map(.name)) + map(select(
          .latestDeployment == null
          or .latestDeployment.status != "SUCCESS"
          or (.latestDeployment.createdAt < $since and ($grace | not))
        ) | "\(.name) (\(.latestDeployment.status // "sin desplegar"))")
      | join(", ")' "$@")"
  if [ -z "$pending" ]; then
    echo "Desplegado en $environment: $*"
    exit 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Sin desplegar a tiempo en $environment: $pending" >&2
    exit 1
  fi
  if grep -qE 'FAILED|CRASHED|REMOVED' <<< "$pending" && [ "$SECONDS" -ge "$grace" ]; then
    echo "Despliegue fallido en $environment: $pending" >&2
    exit 1
  fi
  echo "Esperando: $pending"
  sleep 15
done
