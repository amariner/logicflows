#!/usr/bin/env bash
# Prueba de humo de la imagen de producción de Keycloak (ADR-0010).
# Arranca la imagen contra un PostgreSQL efímero y comprueba que:
# - arranca en modo producción con la dirección pública indicada;
# - el realm logicflows no tiene usuarios;
# - el visor solo admite su propia dirección.
# Uso: infra/keycloak/comprobar-produccion.sh [imagen]
set -euo pipefail

image="${1:-logicflows-identity:local}"
name="logicflows-identidad-prueba-$$"
hostname_url="http://localhost:18080"
visor_url="https://visor.example.com"
admin_password="$(openssl rand -hex 16)"
db_password="$(openssl rand -hex 16)"

cleanup() {
  docker rm -f "$name-keycloak" "$name-postgres" > /dev/null 2>&1 || true
  docker network rm "$name" > /dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$name" > /dev/null
docker run -d --name "$name-postgres" --network "$name" \
  -e POSTGRES_USER=keycloak -e POSTGRES_PASSWORD="$db_password" -e POSTGRES_DB=keycloak \
  postgres:18.6 > /dev/null
docker run -d --name "$name-keycloak" --network "$name" \
  -p 127.0.0.1:18080:8080 -p 127.0.0.1:19000:9000 \
  -e KC_HOSTNAME="$hostname_url" \
  -e KC_DB_URL="jdbc:postgresql://$name-postgres:5432/keycloak" \
  -e KC_DB_USERNAME=keycloak -e KC_DB_PASSWORD="$db_password" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$admin_password" \
  -e LOGICFLOWS_VISOR_URL="$visor_url" \
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
  echo "Keycloak no está listo" >&2
  exit 1
fi

fail() {
  echo "FALLO: $1" >&2
  exit 1
}

issuer="$(curl -fsS http://127.0.0.1:18080/realms/logicflows/.well-known/openid-configuration | jq -r .issuer)"
[ "$issuer" = "$hostname_url/realms/logicflows" ] || fail "emisor inesperado: $issuer"
echo "✓ Emisor de los tokens: $issuer"

token="$(curl -fsS http://127.0.0.1:18080/realms/master/protocol/openid-connect/token \
  -d grant_type=password -d client_id=admin-cli -d username=admin --data-urlencode "password=$admin_password" |
  jq -r .access_token)"
admin() {
  curl -fsS -H "Authorization: Bearer $token" "http://127.0.0.1:18080/admin/realms/logicflows$1"
}

users="$(admin /users/count)"
[ "$users" = "0" ] || fail "el realm tiene $users usuarios"
echo "✓ El realm logicflows no tiene usuarios"

client="$(admin '/clients?clientId=logicflows-visor')"
# Keycloak no conserva el orden de estas listas: se comparan ordenadas.
app_uris='io.github.amariner.logicflows:/*'
redirects="$(jq -c '.[0].redirectUris | sort' <<< "$client")"
expected="$(jq -cn --arg v "$visor_url/*" --arg a "$app_uris" '[$v, $a] | sort')"
[ "$redirects" = "$expected" ] || fail "direcciones de retorno inesperadas: $redirects"
origins="$(jq -c '.[0].webOrigins | sort' <<< "$client")"
expected="$(jq -cn --arg v "$visor_url" '[$v, "https://localhost"] | sort')"
[ "$origins" = "$expected" ] || fail "orígenes inesperados: $origins"
logout="$(jq -r '.[0].attributes["post.logout.redirect.uris"]' <<< "$client")"
[ "$logout" = "$visor_url/*##$app_uris" ] || fail "retornos tras cerrar sesión inesperados: $logout"
echo "✓ El visor solo admite $visor_url y la app Android ($app_uris)"
