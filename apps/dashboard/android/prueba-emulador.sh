#!/usr/bin/env bash
# Prueba de humo de la app en un emulador Android (LF-74): instala el APK,
# arranca la app y comprueba que la vista web carga sin errores de
# JavaScript y que, sin sesión, abre el inicio de sesión en el navegador del
# sistema (LF-68). Deja en <carpeta> el registro (logcat) y una captura.
#
#   apps/dashboard/android/prueba-emulador.sh <app-debug.apk> <carpeta>
#
# Necesita adb conectado a un emulador o dispositivo ya arrancado.
set -euo pipefail

apk="${1:?Uso: $0 <apk> <carpeta>}"
out="${2:?Uso: $0 <apk> <carpeta>}"
package='io.github.amariner.logicflows'
mkdir -p "$out"

finish() {
  adb logcat -d > "$out/logcat.txt" || true
  adb exec-out screencap -p > "$out/pantalla.png" || true
}
trap finish EXIT

fail() {
  echo "✗ $1" >&2
  exit 1
}

# Espera hasta 2 minutos a que se cumpla una condición.
wait_for() {
  local description="$1"
  shift
  for _ in $(seq 1 60); do
    if "$@"; then
      echo "✓ $description"
      return 0
    fi
    sleep 2
  done
  fail "$description: no ocurrió en 2 minutos"
}

loaded() { adb logcat -d | grep -q 'Loading app at https://localhost'; }
# La app pide abrir el inicio de sesión de Keycloak en el navegador del
# sistema (plugin Browser), no en la vista web, y pasa a segundo plano.
login_in_browser() {
  adb logcat -d | grep -q -E 'pluginId: Browser, methodName: open, methodData: \{"url":"https:[^"]*openid-connect\\?/auth' &&
    adb logcat -d | grep -q 'Capacitor: App paused'
}

# Sin excepciones de Java en el proceso de la app. Que Android cierre la app
# en segundo plano por falta de memoria no es un fallo.
no_crash() {
  ! adb logcat -d | grep -A2 'FATAL EXCEPTION' | grep -q "$package"
}

# En un emulador recién arrancado, Google Play Services sigue iniciándose y
# Android puede cerrar las apps que dependen de él. Se le da tiempo.
sleep "${ESPERA_ARRANQUE:-60}"

adb install -r "$apk" > /dev/null
echo "✓ APK instalado"
adb logcat -c
adb shell am start -W -n "$package/.MainActivity" > /dev/null

wait_for 'La vista web carga la aplicación' loaded
wait_for 'Sin sesión, el inicio de sesión se abre en el navegador del sistema' login_in_browser

no_crash || fail 'La app se cerró con una excepción'
echo '✓ Sin excepciones de la app'

# Capacitor copia en el registro la consola de la vista web, con nivel E
# para los errores. Solo cuentan los del visor (https://localhost/…): los
# scripts que inyecta Capacitor no tienen fichero y se revisan en un móvil
# (LF-71).
if adb logcat -d | grep -E ' E Capacitor/Console: File: https://localhost/'; then
  fail 'Hay errores de JavaScript en el visor'
fi
if adb logcat -d | grep -q -E ' E Capacitor/Console: File:  '; then
  echo '! Errores en scripts inyectados por Capacitor (ver logcat):'
  adb logcat -d | grep -E ' E Capacitor/Console: File:  ' | sed 's/^.*Msg: /  /' | sort -u
fi
echo '✓ Sin errores de JavaScript'
