#!/usr/bin/env bash
# Carga la ventana de datos de la demo en un entorno de Railway (ADR-0019):
# vacía el histórico y lo vuelve a generar con el guion diario del simulador.
#
# Uso: infra/railway/cargar-ventana.sh <entorno> [días]
#
# La API descarta una sesión anterior a la última que conoce (ADR-0004), y la
# conoce también por los mensajes retenidos que el broker le entrega al
# suscribirse. Por eso, en este orden:
#   1. Detiene el simulador en directo.
#   2. Borra sus mensajes retenidos en el broker.
#   3. Vacía el histórico (infra/postgres/vaciar-historico.sql).
#   4. Reinicia la API, que olvida las sesiones que conocía.
#   5. Genera los días con el histórico simulado.
#   6. Espera a que la API lo guarde y vuelve a arrancar el simulador.
# Los pasos 2 y 5 corren en servicios temporales de Railway, con las
# credenciales del simulador por referencia, que se borran al terminar.
#
# Borra datos: solo tiene sentido con datos simulados.
set -euo pipefail

environment="${1:?Falta el entorno}"
days="${2:-31}"
region="europe-west4-drams3a"
here="$(cd "$(dirname "$0")" && pwd)"
version="$(sed -n "s/^const VERSION = '\(.*\)';$/\1/p" "$here/../../.railway/railway.ts")"
# shellcheck source=servicio-temporal.sh
source "$here/servicio-temporal.sh"

# Si un paso falla, el simulador se queda detenido: se avisa de cómo arrancarlo.
on_exit() {
  local status=$?
  cleanup
  if [ "$status" -ne 0 ]; then
    echo "El simulador sigue detenido: se arranca con" >&2
    echo "  railway service scale --service simulator $region=1 us-west2=0" >&2
  fi
}
trap on_exit EXIT

railway environment "$environment" > /dev/null

echo "1/6 Deteniendo el simulador…"
# Escalar a 0 réplicas no lo detiene: Railway lo vuelve a desplegar. Se retira
# su despliegue y, al final, se despliega de nuevo.
railway down --service simulator --environment "$environment" --yes > /dev/null 2>&1 || true

echo "2/6 Borrando sus mensajes retenidos…"
# Un mensaje retenido vacío borra el anterior.
run_temporary retenidos eclipse-mosquitto:2.1.2-alpine \
  "sh -c 'a=\${MQTT_URL#*://}; for c in \$(echo \${SIMULATOR_CELLS:-\$SIMULATOR_CELL_ID} | tr , \" \"); do for k in status state telemetry; do mosquitto_pub -h \${a%:*} -p \${a##*:} -u simulator -P \"\$MQTT_SIMULATOR_PASSWORD\" -q 1 -r -n -t logicflows/v1/\$SIMULATOR_SITE_ID/\$c/\$k || exit 1; done; done; echo RETENIDOS-BORRADOS'" \
  RETENIDOS-BORRADOS

echo "3/6 Vaciando el histórico…"
"$here/ejecutar-sql.sh" "$environment" "$here/../postgres/vaciar-historico.sql"

echo "4/6 Reiniciando la API…"
railway service redeploy --service api --environment "$environment" --yes > /dev/null
sleep 90

echo "5/6 Generando $days días con el guion ($version)…"
run_temporary ventana "ghcr.io/amariner/logicflows-simulator:$version" \
  "sh -c 'node dist/backfill-main.js && echo CARGA-COMPLETADA'" CARGA-COMPLETADA \
  'SIMULATOR_SEED=${{simulator.SIMULATOR_SEED}}' SIMULATOR_SCENARIO=guion "SIMULATOR_BACKFILL_DAYS=$days"

# La carga publica a 200 mensajes por segundo, por debajo de los unos 300
# que guarda la API en Railway: si fuera más deprisa, el broker llenaría la
# cola de la API y descartaría mensajes (LF-123). Al terminar, a la API solo
# le queda lo último; el simulador puede arrancar: sus mensajes llegan detrás.
wait_s=120
echo "6/6 Esperando ${wait_s} s a que la API lo guarde y arrancando el simulador…"
sleep "$wait_s"
# Tras `railway down`, un despliegue nuevo va a la región por defecto (us-west2,
# comprobado el 5 de octubre de 2026): se fija la región, como en
# .railway/railway.ts, y eso ya lo vuelve a desplegar.
railway service scale --service simulator --environment "$environment" "$region=1" us-west2=0 > /dev/null
echo "Ventana cargada."
