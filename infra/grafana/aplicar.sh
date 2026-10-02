#!/usr/bin/env bash
# Aplica en Grafana Cloud la observabilidad de LogicFlows (ADR-0013): la
# carpeta, el panel de producción, el punto de contacto y las alertas. Se
# puede repetir: cada ejecución deja Grafana igual que los ficheros.
#
#   infra/grafana/aplicar.sh
#
# Necesita estas variables de entorno, cuyos valores no se imprimen:
#   GRAFANA_URL          dirección de la instancia, https://<pila>.grafana.net
#   GRAFANA_TOKEN        token de una cuenta de servicio con rol Admin
#   GRAFANA_ALERT_EMAIL  dirección o direcciones, separadas por comas, que
#                        reciben las alertas
# Opcional:
#   GRAFANA_DATASOURCE_UID  origen de datos Prometheus. Sin valor se usa el de
#                           la pila (<pila>-prom).
#
# Necesita curl y jq.
set -euo pipefail

FOLDER_UID='logicflows'
CONTACT_POINT_UID='logicflows-correo'
CONTACT_POINT_NAME='LogicFlows · correo'
here="$(cd "$(dirname "$0")" && pwd)"

for name in GRAFANA_URL GRAFANA_TOKEN GRAFANA_ALERT_EMAIL; do
  if [[ -z "${!name:-}" ]]; then
    echo "Falta la variable de entorno $name" >&2
    exit 2
  fi
done
GRAFANA_URL="${GRAFANA_URL%/}"

# Petición a la API de Grafana. Devuelve el cuerpo; si la respuesta no es 2xx,
# lo muestra y falla, salvo que el código esté en la lista de aceptados.
grafana() {
  local method="$1" path="$2" body="${3:-}" accepted="${4:-}"
  local response status
  response="$(curl -sS -X "$method" "$GRAFANA_URL$path" \
    -H "Authorization: Bearer $GRAFANA_TOKEN" \
    -H 'Content-Type: application/json' \
    ${body:+--data-binary "$body"} \
    -w $'\n%{http_code}')"
  status="${response##*$'\n'}"
  response="${response%$'\n'*}"
  if [[ "$status" != 2* && " $accepted " != *" $status "* ]]; then
    echo "Grafana respondió $status a $method $path: $response" >&2
    return 1
  fi
  printf '%s' "$response"
}

datasource="${GRAFANA_DATASOURCE_UID:-}"
if [[ -z "$datasource" ]]; then
  datasource="$(grafana GET /api/datasources |
    jq -r '[.[] | select(.type == "prometheus" and (.name | endswith("-prom")))][0].uid // empty')"
  if [[ -z "$datasource" ]]; then
    echo 'No hay un origen de datos Prometheus <pila>-prom; indica GRAFANA_DATASOURCE_UID' >&2
    exit 1
  fi
fi
echo "Origen de datos: $datasource"

# 409 o 412: la carpeta ya existe.
grafana POST /api/folders "$(jq -n --arg uid "$FOLDER_UID" '{uid: $uid, title: "LogicFlows"}')" \
  '409 412' >/dev/null
echo "Carpeta: $FOLDER_UID"

grafana POST /api/dashboards/db "$(jq -n --arg folder "$FOLDER_UID" \
  --slurpfile dashboard "$here/panel-produccion.json" \
  '{dashboard: ($dashboard[0] | .id = null), folderUid: $folder, overwrite: true,
    message: "infra/grafana/aplicar.sh"}')" |
  jq -r '"Panel: " + .url'

contact_point="$(jq -n --arg uid "$CONTACT_POINT_UID" --arg name "$CONTACT_POINT_NAME" \
  --arg addresses "$GRAFANA_ALERT_EMAIL" \
  '{uid: $uid, name: $name, type: "email", disableResolveMessage: false,
    settings: {addresses: $addresses, singleEmail: true}}')"
if grafana GET /api/v1/provisioning/contact-points | jq -e --arg uid "$CONTACT_POINT_UID" \
  'any(.[]; .uid == $uid)' >/dev/null; then
  grafana PUT "/api/v1/provisioning/contact-points/$CONTACT_POINT_UID" "$contact_point" >/dev/null
else
  grafana POST /api/v1/provisioning/contact-points "$contact_point" >/dev/null
fi
echo "Punto de contacto: $CONTACT_POINT_NAME"

grafana PUT "/api/v1/provisioning/folder/$FOLDER_UID/rule-groups/logicflows" \
  "$(jq --arg datasource "$datasource" --arg receiver "$CONTACT_POINT_NAME" '
    .rules |= map(
      .folderUID = "'"$FOLDER_UID"'"
      | .ruleGroup = "logicflows"
      | .notification_settings.receiver = $receiver
      | .data |= map(if .datasourceUid == "__ORIGEN__" then .datasourceUid = $datasource else . end))
  ' "$here/alertas.json")" |
  jq -r '"Alertas: " + ([.rules[].title] | join(", "))'
