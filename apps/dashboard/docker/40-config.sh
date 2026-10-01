#!/bin/sh
# Genera config.json a partir de las variables de entorno al arrancar el
# contenedor (configuración en tiempo de ejecución, ver apps/dashboard).
set -eu
: "${API_URL:?Falta API_URL}"
envsubst '${API_URL}' < /etc/logicflows/config.json.template > /usr/share/nginx/html/config.json
echo "config.json generado con apiUrl=${API_URL}"
