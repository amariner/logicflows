#!/bin/sh
# Genera config.json a partir de las variables de entorno al arrancar el
# contenedor (configuración en tiempo de ejecución, ver apps/dashboard).
#   API_URL         URL de la API vista desde el navegador (obligatoria).
#   AUTH_ISSUER     Emisor OpenID Connect (ADR-0009). Sin él no se pide sesión.
#   AUTH_CLIENT_ID  Cliente público del visor en el proveedor.
# También genera las cabeceras de seguridad de Nginx, cuya política de
# contenidos solo permite conectar con la API y con el proveedor (LF-52).
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

# Origen (esquema, host y puerto) de una URL.
origin() {
  printf '%s' "$1" | sed -E 's#^(https?://[^/]+).*#\1#'
}
api_origin=$(origin "$API_URL")
realtime_origin=$(printf '%s' "$api_origin" | sed -E 's#^http#ws#')
issuer_origin=""
if [ -n "$AUTH_ISSUER" ]; then
  issuer_origin=$(origin "$AUTH_ISSUER")
fi

# Ionic aplica estilos en línea a sus componentes: style-src necesita
# 'unsafe-inline'. Los scripts solo pueden venir del propio visor.
csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${api_origin} ${realtime_origin} ${issuer_origin}; form-action 'self' ${issuer_origin}; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"

cat > /etc/nginx/conf.d/security-headers.inc <<HEADERS
add_header Content-Security-Policy "${csp}" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header X-Frame-Options "DENY" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Strict-Transport-Security "max-age=31536000" always;
HEADERS
echo "Cabeceras de seguridad generadas para ${api_origin} ${issuer_origin}"
