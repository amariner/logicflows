#!/usr/bin/env bash
# Restauración de prueba de las copias de seguridad de un entorno de Railway
# (ADR-0017). Crea un servicio temporal con la imagen logicflows-backup que
# ejecuta probar-restauracion.sh, espera a que termine, muestra su registro y
# lo borra. Las credenciales del bucket no salen de Railway: el servicio las
# recibe por referencia.
#
# Uso: infra/railway/probar-copias.sh <entorno> <etiqueta de la imagen>
set -euo pipefail

environment="${1:?Falta el entorno}"
tag="${2:?Falta la etiqueta de la imagen}"
service="probar-copias-$(date +%s)"

variables=(
  --variables 'COPIAS_S3_ENDPOINT=${{copias.ENDPOINT}}'
  --variables 'COPIAS_S3_BUCKET=${{copias.BUCKET}}'
  --variables 'COPIAS_S3_REGION=${{copias.REGION}}'
  --variables 'COPIAS_S3_ACCESS_KEY_ID=${{copias.ACCESS_KEY_ID}}'
  --variables 'COPIAS_S3_SECRET_ACCESS_KEY=${{copias.SECRET_ACCESS_KEY}}'
)

cleanup() {
  railway service delete --service "$service" --environment "$environment" --yes > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creando el servicio temporal $service en $environment…"
railway environment "$environment" > /dev/null
service_id="$(railway add --service "$service" --image "ghcr.io/amariner/logicflows-backup:$tag" \
  "${variables[@]}" --json 2> /dev/null | tail -1 | jq -r .id)"
environment_id="$(railway status --json | jq -r --arg name "$environment" \
  '.environments.edges[].node | select(.name == $name) | .id')"
railway api 'mutation($s:String!,$e:String!,$c:String!){ serviceInstanceUpdate(serviceId:$s, environmentId:$e, input:{startCommand:$c, restartPolicyType:NEVER}) }' \
  --var s="$service_id" --var e="$environment_id" --var c=/opt/copias/probar-restauracion.sh > /dev/null
# En la misma región que la base de datos y el bucket (Ámsterdam).
railway service scale --service "$service" europe-west4-drams3a=1 sfo=0 > /dev/null
railway service redeploy --service "$service" --from-source --yes > /dev/null

# Se leen los registros enteros antes de buscar (ver ejecutar-sql.sh).
logs=""
for _ in $(seq 1 120); do
  sleep 5
  logs="$(railway logs --service "$service" --deployment 2> /dev/null || true)"
  if grep -qE 'RESTAURACION-COMPLETADA|ERROR' <<< "$logs"; then
    break
  fi
done
grep -vE '^\s*$|Starting Container' <<< "$logs" || true
grep -q RESTAURACION-COMPLETADA <<< "$logs"
