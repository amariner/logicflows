#!/usr/bin/env bash
# Crea la clave de firma de la app Android (ADR-0014): un almacén PKCS12 con
# una clave RSA de 4096 bits y un certificado autofirmado válido 30 años.
#
#   ANDROID_KEYSTORE_PASSWORD=… apps/dashboard/android/crear-clave.sh <fichero.p12>
#
# La contraseña se lee de la variable de entorno y nunca se imprime. El alias
# de la clave es logicflows. Al terminar muestra la huella SHA-256 del
# certificado, la que se publica con cada APK.
#
# Lo ejecuta una vez el Tech Lead (README.md de esta carpeta). La CI lo usa
# además con una clave desechable para comprobar que la firma funciona.
# Necesita OpenSSL 3, que genera el almacén con PBES2 y AES-256.
set -euo pipefail

target="${1:-}"
if [ -z "$target" ]; then
  echo "Uso: ANDROID_KEYSTORE_PASSWORD=… $0 <fichero.p12>" >&2
  exit 2
fi
: "${ANDROID_KEYSTORE_PASSWORD:?Falta ANDROID_KEYSTORE_PASSWORD}"
if [ "${#ANDROID_KEYSTORE_PASSWORD}" -lt 16 ]; then
  echo "La contraseña debe tener al menos 16 caracteres" >&2
  exit 2
fi
if [ -e "$target" ]; then
  echo "$target ya existe: no se sobrescribe una clave" >&2
  exit 1
fi
if ! openssl version | grep -q '^OpenSSL 3'; then
  echo "Hace falta OpenSSL 3 (en macOS, el de Homebrew): $(openssl version)" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# La clave privada solo existe sin cifrar dentro de la carpeta temporal.
umask 077
openssl req -x509 -newkey rsa:4096 -sha256 -days 10950 -nodes \
  -subj '/CN=LogicFlows/O=LogicFlows' \
  -keyout "$work/clave.pem" -out "$work/certificado.pem" 2> /dev/null
openssl pkcs12 -export -name logicflows \
  -inkey "$work/clave.pem" -in "$work/certificado.pem" \
  -keypbe AES-256-CBC -certpbe AES-256-CBC -macalg sha256 \
  -passout env:ANDROID_KEYSTORE_PASSWORD -out "$target"

echo "Clave creada en $target (alias logicflows)"
openssl x509 -in "$work/certificado.pem" -noout -fingerprint -sha256
