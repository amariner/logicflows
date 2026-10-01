#!/bin/sh
# Genera config.json a partir de las variables de entorno al arrancar el
# contenedor (configuración en tiempo de ejecución, ver apps/dashboard).
#   API_URL         URL de la API vista desde el navegador (obligatoria).
#   AUTH_ISSUER     Emisor OpenID Connect (ADR-0009). Sin él no se pide sesión.
#   AUTH_CLIENT_ID  Cliente público del visor en el proveedor.
set -eu
: "${API_URL:?Falta API_URL}"
AUTH_ISSUER="${AUTH_ISSUER:-}"
AUTH_CLIENT_ID="${AUTH_CLIENT_ID:-}"

for value in "$API_URL" "$AUTH_ISSUER" "$AUTH_CLIENT_ID"; do
  case "$value" in
    *\"* | *\\*) echo "Las variables de configuración no pueden contener comillas ni barras invertidas" >&2; exit 1 ;;
  esac
done

target=/usr/share/nginx/html/config.json
if [ -n "$AUTH_ISSUER" ]; then
  : "${AUTH_CLIENT_ID:?Falta AUTH_CLIENT_ID}"
  printf '{\n  "apiUrl": "%s",\n  "auth": { "issuer": "%s", "clientId": "%s" }\n}\n' \
    "$API_URL" "$AUTH_ISSUER" "$AUTH_CLIENT_ID" > "$target"
  echo "config.json generado con apiUrl=${API_URL} e inicio de sesión en ${AUTH_ISSUER}"
else
  printf '{\n  "apiUrl": "%s"\n}\n' "$API_URL" > "$target"
  echo "config.json generado con apiUrl=${API_URL}, sin inicio de sesión"
fi
