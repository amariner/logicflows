#!/bin/sh
# Genera el fichero de contraseñas de Mosquitto a partir de las variables de
# entorno y arranca el broker. Las credenciales no se guardan en el
# repositorio.
set -eu

: "${MQTT_API_PASSWORD:?Falta MQTT_API_PASSWORD}"
: "${MQTT_SIMULATOR_PASSWORD:?Falta MQTT_SIMULATOR_PASSWORD}"

passwd_file=/mosquitto/auth/passwd
mkdir -p "$(dirname "$passwd_file")"
rm -f "$passwd_file"
touch "$passwd_file"
chmod 0700 "$passwd_file"
mosquitto_passwd -b "$passwd_file" api "$MQTT_API_PASSWORD"
mosquitto_passwd -b "$passwd_file" simulator "$MQTT_SIMULATOR_PASSWORD"
chown -R mosquitto:mosquitto /mosquitto/auth /mosquitto/data

exec mosquitto -c /mosquitto/config/mosquitto.conf
