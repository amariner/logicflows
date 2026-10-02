#!/usr/bin/env bash
# Ciclo de vida de la previsualización de una pull request en Railway
# (ADR-0012). El entorno se llama pr-<número> y lo describe .railway/railway.ts.
#
#   infra/railway/previsualizacion.sh desplegar <número de la PR>
#   infra/railway/previsualizacion.sh destruir <número de la PR>
#
# desplegar crea el entorno si no existe, aplica .railway/railway.ts con las
# imágenes de la PR, prepara PostgreSQL y espera a que el despliegue nuevo esté
# sano. Necesita estas variables de entorno, cuyos valores no se imprimen:
#   LOGICFLOWS_IMAGE_TAG   etiqueta de las imágenes de la PR en GHCR
#   PREVIEW_SECRETS_SEED   semilla de los secretos de las previsualizaciones
#   E2E_PASSWORD           contraseña del usuario prueba-e2e
# destruir borra el entorno con sus volúmenes. No falla si ya no existe.
#
# Necesita la CLI de Railway con sesión iniciada, o RAILWAY_API_TOKEN con un
# token de cuenta, y jq. Si se ejecuta en GitHub Actions, escribe las
# direcciones en GITHUB_OUTPUT.
set -euo pipefail

PROJECT_ID='ecd6658d-9825-4004-801a-64a28bc9f4a7'
APPS=(broker identity api simulator dashboard)

action="${1:-}"
pr="${2:-}"
if [[ ! "$action" =~ ^(desplegar|destruir)$ || ! "$pr" =~ ^[0-9]+$ ]]; then
  echo "Uso: $0 desplegar|destruir <número de la PR>" >&2
  exit 2
fi
environment="pr-$pr"
root="$(cd "$(dirname "$0")/../.." && pwd)"

exists() {
  railway environment list --json |
    jq -e --arg name "$environment" '.environments[] | select(.name == $name)' > /dev/null
}

if [ "$action" = destruir ]; then
  if exists; then
    railway environment delete "$environment" --yes > /dev/null
    # El borrado es asíncrono: se espera a que el entorno desaparezca para
    # que una reapertura inmediata de la PR pueda crearlo de nuevo.
    for _ in $(seq 1 60); do
      exists || break
      sleep 5
    done
    if exists; then
      echo "La previsualización $environment sigue existiendo" >&2
      exit 1
    fi
    echo "Previsualización $environment borrada"
  else
    echo "La previsualización $environment no existe"
  fi
  exit 0
fi

: "${LOGICFLOWS_IMAGE_TAG:?Falta LOGICFLOWS_IMAGE_TAG}"
: "${PREVIEW_SECRETS_SEED:?Falta PREVIEW_SECRETS_SEED}"
: "${E2E_PASSWORD:?Falta E2E_PASSWORD}"
export LOGICFLOWS_IMAGE_TAG PREVIEW_SECRETS_SEED E2E_PASSWORD

# El mismo cálculo que previewSecret() en .railway/railway.ts.
secret() {
  printf '%s' "$environment:$1" | openssl dgst -sha256 -hmac "$PREVIEW_SECRETS_SEED" -r | cut -d' ' -f1
}

services() {
  railway service list --environment "$environment" --json
}

# Espera a que los servicios indicados tengan un despliegue correcto posterior
# a $since. Si al cabo de un minuto un servicio no tiene despliegue nuevo, es
# que el cambio no le afectaba y vale el que tiene.
wait_for() {
  local since="$1" deadline=$((SECONDS + 900)) grace=$((SECONDS + 60)) pending expired
  shift
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
    [ -z "$pending" ] && return 0
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Sin desplegar a tiempo: $pending" >&2
      return 1
    fi
    if grep -qE 'FAILED|CRASHED|REMOVED' <<< "$pending" && [ "$SECONDS" -ge "$grace" ]; then
      echo "Despliegue fallido: $pending" >&2
      return 1
    fi
    echo "Esperando: $pending"
    sleep 15
  done
}

created=false
if exists; then
  echo "Actualizando la previsualización $environment con $LOGICFLOWS_IMAGE_TAG"
else
  echo "Creando la previsualización $environment con $LOGICFLOWS_IMAGE_TAG"
  # Railway admite un entorno nuevo cada 30 segundos por espacio de trabajo:
  # dos PR abiertas casi a la vez chocarían.
  for attempt in 1 2 3 4 5; do
    railway environment new "$environment" > /dev/null && break
    [ "$attempt" -eq 5 ] && exit 1
    echo "Reintentando la creación del entorno en 30 s"
    sleep 30
  done
  created=true
fi
railway link --project "$PROJECT_ID" --environment "$environment" > /dev/null

since="$(date -u +%Y-%m-%dT%H:%M:%S)"
(cd "$root" && railway config apply --yes)

# Usuarios y bases de datos de la API y de Keycloak, como en producción. Es
# idempotente: en cada commit solo confirma que siguen ahí.
wait_for "1970-01-01" Postgres
API_PASSWORD="$(secret db-api)" KEYCLOAK_PASSWORD="$(secret db-keycloak)" \
  "$root/infra/railway/ejecutar-sql.sh" "$environment" "$root/infra/postgres/usuarios.sql" \
  API_PASSWORD KEYCLOAK_PASSWORD

# Al crear el entorno, la API y Keycloak arrancan antes de que existan sus
# usuarios de PostgreSQL y fallan, o siguen fallando durante su comprobación de
# salud. Se vuelven a desplegar ya con los usuarios creados. Si una ejecución
# anterior quedó a medias, se redespliega lo que falló.
for app in api identity; do
  status="$(services | jq -r --arg n "$app" '.[] | select(.name == $n) | .latestDeployment.status // ""')"
  if [ "$created" = true ] || [[ "$status" =~ ^(FAILED|CRASHED)$ ]]; then
    echo "Redesplegando $app ($status)"
    railway service redeploy --service "$app" --environment "$environment" --yes > /dev/null
  fi
done

wait_for "$since" "${APPS[@]}"

dashboard="https://logicflows-$environment-dashboard.up.railway.app"
api="https://logicflows-$environment-api.up.railway.app"
identity="https://logicflows-$environment-identity.up.railway.app"
for url in "$dashboard/config.json" "$api/health/ready" \
  "$identity/realms/logicflows/.well-known/openid-configuration"; do
  curl -fsS --retry 20 --retry-delay 6 --retry-all-errors -o /dev/null "$url"
done

echo "Previsualización lista: $dashboard"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "dashboard=$dashboard"
    echo "api=$api"
    echo "identity=$identity"
    echo "broker=wss://logicflows-$environment-broker.up.railway.app"
  } >> "$GITHUB_OUTPUT"
fi
