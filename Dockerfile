# Imágenes de LogicFlows. Un único Dockerfile con una etapa por aplicación
# comparte la instalación y la compilación del monorepo:
#   docker build --target api -t logicflows-api .
#   docker build --target simulator -t logicflows-simulator .
#   docker build --target dashboard -t logicflows-dashboard .
# La configuración se da al arrancar con variables de entorno (.env.example):
# la misma imagen sirve para cualquier entorno.

# La compilación usa glibc: pnpm descarga el Node de devEngines desde nodejs.org.
FROM node:24.21.0-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
# Solo el lockfile: la descarga de dependencias se guarda en caché mientras no cambie.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter @logicflows/contract build \
 && pnpm --filter @logicflows/api --filter @logicflows/simulator --filter @logicflows/dashboard build
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
COPY apps/dashboard/docker/config.json.template /etc/logicflows/config.json.template
COPY apps/dashboard/docker/40-config.sh /docker-entrypoint.d/40-config.sh
COPY --from=build --chown=nginx:root /repo/apps/dashboard/www /usr/share/nginx/html
ENV API_URL=http://localhost:3000
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/config.json > /dev/null || exit 1
