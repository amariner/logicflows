#!/usr/bin/env bash
# Ejecuta un script SQL como administrador en el PostgreSQL de un entorno de
# Railway (LF-48). Crea un servicio temporal con psql dentro de la red privada,
# espera a que termine, muestra su registro y lo borra. La contraseña de
# administrador no sale de Railway: el servicio la recibe por referencia.
#
# Uso: infra/railway/ejecutar-sql.sh <entorno> <script.sql> [VARIABLE...]
# Cada VARIABLE es el nombre de una variable de entorno local cuyo valor se
# pasa a psql como variable con el mismo nombre en minúsculas, por ejemplo:
#   API_PASSWORD=... KEYCLOAK_PASSWORD=... \
#     infra/railway/ejecutar-sql.sh production infra/postgres/usuarios.sql \
#     API_PASSWORD KEYCLOAK_PASSWORD
# Los valores no se imprimen.
set -euo pipefail

environment="${1:?Falta el entorno}"
script="${2:?Falta el script SQL}"
shift 2
service="sql-$(date +%s)"

variables=(
  --variables 'PGHOST=${{Postgres.RAILWAY_PRIVATE_DOMAIN}}'
  --variables 'PGPORT=5432'
  --variables 'PGUSER=${{Postgres.PGUSER}}'
  --variables 'PGPASSWORD=${{Postgres.PGPASSWORD}}'
  --variables 'PGDATABASE=${{Postgres.PGDATABASE}}'
  --variables "SQL=$(cat "$script")"
)
psql_vars=""
for name in "$@"; do
  value="${!name:?Falta la variable $name}"
  variables+=(--variables "$name=$value")
  psql_vars="$psql_vars -v $(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')=\"\$$name\""
done

cleanup() {
  railway service delete --service "$service" --environment "$environment" --yes > /dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Creando el servicio temporal $service en $environment…"
railway environment "$environment" > /dev/null
service_id="$(railway add --service "$service" --image postgres:18.6 "${variables[@]}" --json 2>/dev/null |
  tail -1 | jq -r .id)"
environment_id="$(railway status --json | jq -r --arg name "$environment" \
  '.environments.edges[].node | select(.name == $name) | .id')"
command="sh -c 'printf \"%s\\n\" \"\$SQL\" | psql -v ON_ERROR_STOP=1$psql_vars && echo SQL-COMPLETADO'"
railway api 'mutation($s:String!,$e:String!,$c:String!){ serviceInstanceUpdate(serviceId:$s, environmentId:$e, input:{startCommand:$c, restartPolicyType:NEVER}) }' \
  --var s="$service_id" --var e="$environment_id" --var c="$command" > /dev/null
# En la misma región que la base de datos (Ámsterdam).
railway service scale --service "$service" europe-west4-drams3a=1 sfo=0 > /dev/null
railway service redeploy --service "$service" --from-source --yes > /dev/null

for _ in $(seq 1 60); do
  sleep 5
  if railway logs --service "$service" --deployment 2> /dev/null | grep -qE 'SQL-COMPLETADO|ERROR|FATAL'; then
    break
  fi
done
railway logs --service "$service" --deployment 2> /dev/null | grep -vE '^\s*$|Starting Container'
railway logs --service "$service" --deployment 2> /dev/null | grep -q SQL-COMPLETADO
