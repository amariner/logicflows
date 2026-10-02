#!/usr/bin/env bash
# Prueba de humo de la imagen de Keycloak de las previsualizaciones (ADR-0012).
# Arranca la imagen contra un PostgreSQL efímero y comprueba que:
# - sin LOGICFLOWS_E2E_PASSWORD no arranca;
# - prueba-e2e inicia sesión con la contraseña de la variable, y no con el
#   texto literal de la variable;
# - el realm importado solo tiene a prueba-e2e, con el rol viewer.
# Uso: infra/keycloak/comprobar-previsualizacion.sh [imagen]
set -euo pipefail

image="${1:-logicflows-identity:preview}"
name="logicflows-identidad-previsualizacion-$$"
hostname_url="http://localhost:18080"
visor_url="https://visor.example.com"
db_password="$(openssl rand -hex 16)"
e2e_password="$(openssl rand -hex 16)"

cleanup() {
  docker rm -f "$name-keycloak" "$name-postgres" > /dev/null 2>&1 || true
  docker network rm "$name" > /dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FALLO: $1" >&2
  exit 1
}

if docker run --rm "$image" > /dev/null 2>&1; then
  fail "arranca sin LOGICFLOWS_E2E_PASSWORD"
fi
echo "✓ Sin LOGICFLOWS_E2E_PASSWORD no arranca"

docker network create "$name" > /dev/null
docker run -d --name "$name-postgres" --network "$name" \
  -e POSTGRES_USER=keycloak -e POSTGRES_PASSWORD="$db_password" -e POSTGRES_DB=keycloak \
  postgres:18.6 > /dev/null
docker run -d --name "$name-keycloak" --network "$name" \
  -p 127.0.0.1:18080:8080 -p 127.0.0.1:19000:9000 \
  -e KC_HOSTNAME="$hostname_url" \
  -e KC_DB_URL="jdbc:postgresql://$name-postgres:5432/keycloak" \
  -e KC_DB_USERNAME=keycloak -e KC_DB_PASSWORD="$db_password" \
  -e LOGICFLOWS_VISOR_URL="$visor_url" \
  -e LOGICFLOWS_E2E_PASSWORD="$e2e_password" \
  "$image" > /dev/null

echo "Esperando a Keycloak…"
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:19000/health/ready 2> /dev/null | grep -q UP; then
    break
  fi
  sleep 2
done
if ! curl -fsS http://127.0.0.1:19000/health/ready | grep -q UP; then
  docker logs "$name-keycloak" | tail -50
  fail "Keycloak no está listo"
fi

# admin-cli existe en todos los realms y admite usuario y contraseña: sirve
# para comprobar las credenciales sin pasar por el navegador.
token() {
  curl -fsS http://127.0.0.1:18080/realms/logicflows/protocol/openid-connect/token \
    -d grant_type=password -d client_id=admin-cli -d username=prueba-e2e \
    --data-urlencode "password=$1"
}

if token "\${LOGICFLOWS_E2E_PASSWORD}" > /dev/null 2>&1; then
  fail "la contraseña es el texto literal de la variable"
fi
token "$e2e_password" > /dev/null ||
  fail "prueba-e2e no inicia sesión con LOGICFLOWS_E2E_PASSWORD"
echo "✓ prueba-e2e inicia sesión con la contraseña de LOGICFLOWS_E2E_PASSWORD"

# admin-cli no incluye los roles en el token: se comprueban en el realm que
# importa la imagen. La prueba de extremo a extremo los comprueba en el token
# del visor.
users="$(docker run --rm --entrypoint cat "$image" /opt/keycloak/data/import/realm-logicflows.json |
  jq -c '[.users[] | {username, realmRoles}]')"
[ "$users" = '[{"username":"prueba-e2e","realmRoles":["viewer"]}]' ] ||
  fail "usuarios inesperados en el realm: $users"
echo "✓ El realm solo tiene a prueba-e2e, con el rol viewer"
