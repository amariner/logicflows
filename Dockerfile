# Imágenes de LogicFlows. Un único Dockerfile con una etapa por aplicación
# comparte la instalación y la compilación del monorepo:
#   docker build --target api -t logicflows-api .
#   docker build --target simulator -t logicflows-simulator .
#   docker build --target dashboard -t logicflows-dashboard .
# Y una etapa por cada servicio de infraestructura con su configuración
# incluida (ADR-0010):
#   docker build --target broker -t logicflows-broker .
#   docker build --target identity -t logicflows-identity .
#   docker build --target backup -t logicflows-backup .
# La variante de Keycloak de las previsualizaciones lleva un usuario de prueba
# (ADR-0012):
#   docker build --target identity-preview -t logicflows-identity:preview .
# La configuración se da al arrancar con variables de entorno (.env.example):
# la misma imagen sirve para cualquier entorno.

# La compilación usa glibc: pnpm descarga el Node de devEngines desde nodejs.org.
# Se ejecuta en la arquitectura de la máquina que construye: el resultado es
# JavaScript sin dependencias nativas y sirve para cualquier arquitectura, así
# que las imágenes ARM no necesitan emulación.
FROM --platform=$BUILDPLATFORM node:24.21.0-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
# Solo el lockfile: la descarga de dependencias se guarda en caché mientras no cambie.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @logicflows/contract build \
 && pnpm --filter @logicflows/api --filter @logicflows/simulator --filter @logicflows/dashboard build
# El visor se sirve comprimido: los ficheros se comprimen una vez aquí y Nginx
# los entrega con gzip_static (LF-59). config.json se genera al arrancar y no
# se comprime: una copia antigua se serviría en su lugar.
RUN find apps/dashboard/www -type f -size +1k ! -name config.json \
      \( -name '*.js' -o -name '*.css' -o -name '*.json' -o -name '*.webmanifest' -o -name '*.svg' -o -name '*.txt' \) \
      -exec gzip -9 -k -n {} +
# Cada servicio Node se queda solo con sus dependencias de producción.
RUN pnpm --filter @logicflows/api deploy --prod --legacy /prod/api \
 && pnpm --filter @logicflows/simulator deploy --prod --legacy /prod/simulator

FROM node:24.21.0-alpine AS node-runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

# API: ingesta MQTT, persistencia, REST y tiempo real.
FROM node-runtime AS api
COPY --from=build --chown=node:node /prod/api ./
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${API_PORT:-3000}/health/live" > /dev/null || exit 1
CMD ["node", "dist/main.js"]

# Simulador de una célula de paletizado. SIGTERM la detiene de forma controlada.
FROM node-runtime AS simulator
COPY --from=build --chown=node:node /prod/simulator ./
CMD ["node", "dist/main.js"]

# Visor web servido por Nginx sin privilegios. config.json se genera al
# arrancar a partir de API_URL.
FROM nginxinc/nginx-unprivileged:1.30.5-alpine AS dashboard
COPY apps/dashboard/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/dashboard/docker/40-config.sh /docker-entrypoint.d/40-config.sh
COPY --from=build --chown=nginx:root /repo/apps/dashboard/www /usr/share/nginx/html
ENV API_URL=http://localhost:3000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/config.json > /dev/null || exit 1

# Broker MQTT (ADR-0004): Mosquitto con la configuración y la ACL del
# repositorio. init.sh genera el fichero de contraseñas al arrancar a partir de
# MQTT_API_PASSWORD y MQTT_SIMULATOR_PASSWORD; la imagen no contiene ninguna.
FROM eclipse-mosquitto:2.1.2-alpine AS broker
COPY infra/mosquitto/mosquitto.conf /mosquitto/config/mosquitto.conf
COPY --chown=mosquitto:mosquitto --chmod=0600 infra/mosquitto/acl /mosquitto/config/acl
COPY infra/mosquitto/init.sh /mosquitto/init/init.sh
EXPOSE 1883 9001
HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=10 \
  CMD mosquitto_sub -h localhost -u api -P "$MQTT_API_PASSWORD" -t '$SYS/broker/uptime' -C 1 -W 3 > /dev/null || exit 1
CMD ["/bin/sh", "/mosquitto/init/init.sh"]

# Realm de producción: se genera a partir del realm local, sin usuarios de
# prueba y con las direcciones del visor tomadas de LOGICFLOWS_VISOR_URL.
FROM --platform=$BUILDPLATFORM node:24.21.0-alpine AS identity-realm
WORKDIR /realm
COPY infra/keycloak/realm-logicflows.json infra/keycloak/realm-produccion.mjs ./
RUN node realm-produccion.mjs realm-logicflows.json logicflows.json

# Keycloak compilado para producción con PostgreSQL y comprobaciones de salud.
# El resultado es Java y sirve para cualquier arquitectura.
FROM --platform=$BUILDPLATFORM quay.io/keycloak/keycloak:26.7.5 AS identity-build
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true
RUN /opt/keycloak/bin/kc.sh build

# Proveedor de identidad (ADR-0009) en modo producción. Al arrancar necesita
# KC_HOSTNAME, KC_DB_URL, KC_DB_USERNAME, KC_DB_PASSWORD, LOGICFLOWS_VISOR_URL y
# el administrador inicial (KC_BOOTSTRAP_ADMIN_USERNAME y _PASSWORD). La
# plataforma termina TLS: Keycloak atiende HTTP y confía en X-Forwarded-*.
FROM quay.io/keycloak/keycloak:26.7.5 AS identity
COPY --from=identity-build /opt/keycloak/ /opt/keycloak/
COPY --from=identity-realm /realm/logicflows.json /opt/keycloak/data/import/realm-logicflows.json
ENV KC_HTTP_ENABLED=true \
    KC_PROXY_HEADERS=xforwarded
EXPOSE 8080 9000
# La imagen no incluye curl: se consulta el puerto de gestión con bash.
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=10 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q UP <&3"]
CMD ["start", "--optimized", "--import-realm"]

# Realm de las previsualizaciones por pull request (ADR-0012): el de producción
# más el usuario de solo lectura de la prueba de extremo a extremo.
FROM identity-realm AS identity-preview-realm
RUN node realm-produccion.mjs realm-logicflows.json logicflows.json --previsualizacion

# Proveedor de identidad de las previsualizaciones. Nunca se despliega en
# producción. Sin LOGICFLOWS_E2E_PASSWORD no arranca: Keycloak importaría como
# contraseña el texto literal de la variable, que está en el repositorio.
FROM identity AS identity-preview
COPY --from=identity-preview-realm /realm/logicflows.json /opt/keycloak/data/import/realm-logicflows.json
ENTRYPOINT ["/bin/bash", "-c", "if [ -z \"$LOGICFLOWS_E2E_PASSWORD\" ]; then echo 'Falta LOGICFLOWS_E2E_PASSWORD' >&2; exit 1; fi; exec /opt/keycloak/bin/kc.sh \"$@\"", "kc.sh"]
CMD ["start", "--optimized", "--import-realm"]

# Copias de seguridad de PostgreSQL (ADR-0017): pg_dump y pg_restore de la
# misma versión que el servidor, y rclone para el bucket. Por defecto hace el
# volcado diario; la restauración de prueba es probar-restauracion.sh.
FROM postgres:18.6 AS backup
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates rclone \
  && rm -rf /var/lib/apt/lists/*
COPY infra/copias/s3.sh infra/copias/copiar.sh infra/copias/probar-restauracion.sh /opt/copias/
ENTRYPOINT []
CMD ["/opt/copias/copiar.sh"]
