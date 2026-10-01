// Infraestructura de LogicFlows en Railway (ADR-0011): servicios, imágenes,
// dominios, volúmenes y comprobaciones de salud del entorno de producción.
//
// Cada cambio llega por pull request: la CI publica el plan en la PR y, al
// fusionarla, aplica exactamente ese plan. Desplegar una versión es cambiar
// VERSION por una etiqueta ya promocionada en GitHub Container Registry
// (vX.Y.Z), nunca por una que haya que compilar. Volver atrás es devolver
// VERSION a la etiqueta anterior.
//
// Los secretos no están aquí: preserve() conserva el valor sellado que ya
// tiene cada variable en Railway (docs/despliegue.md).
import { defineRailway, image, postgres, preserve, project, service, volume } from 'railway/iac';

/** Versión desplegada en producción: etiqueta de las imágenes en GHCR. */
const VERSION = 'sha-edbfac9';

/** Ámsterdam: latencia baja desde España y datos dentro de la UE. */
const REGION = 'europe-west4-drams3a';

const imagen = (app: string) => image(`ghcr.io/amariner/logicflows-${app}:${VERSION}`);

export default defineRailway(() => {
  const Postgres = postgres('Postgres', { region: REGION });
  Postgres.networking = { privateNetworkEndpoint: 'postgres' };
  const postgresVolume = volume('postgres-volume', {
    region: REGION,
    sizeMB: 5000,
    allowOnlineResize: true,
    alerts: { usage: { '80': {}, '95': {}, '100': {} } },
  });

  // Mensajes retenidos y sesiones persistentes de Mosquitto: sin volumen, la
  // API perdería los mensajes en cola de su sesión al reiniciarse el broker.
  const brokerData = volume('broker-data', { region: REGION, sizeMB: 500 });

  const broker = service('broker', {
    source: imagen('broker'),
    replicas: { [REGION]: 1 },
    volumeMounts: { '/mosquitto/data': brokerData },
    // Las células de planta se conectan por MQTT sobre WebSocket con TLS
    // (wss://, ADR-0008). La API y el simulador usan la red privada.
    networking: { serviceDomains: { 'broker-production-c580.up.railway.app': { port: 9001 } } },
    env: { MQTT_API_PASSWORD: preserve(), MQTT_SIMULATOR_PASSWORD: preserve() },
  });

  const identity = service('identity', {
    source: imagen('identity'),
    start: '',
    replicas: { [REGION]: 1 },
    networking: { serviceDomains: { 'identity-production-e786.up.railway.app': { port: 8080 } } },
    // El documento de descubrimiento existe cuando Keycloak ha arrancado y
    // tiene el realm importado.
    healthcheck: '/realms/logicflows/.well-known/openid-configuration',
    healthcheckTimeout: 300,
    env: {
      PORT: '8080',
      KC_DB_PASSWORD: preserve(),
      KC_DB_URL: preserve(),
      KC_DB_USERNAME: preserve(),
      KC_HOSTNAME: preserve(),
      LOGICFLOWS_VISOR_URL: preserve(),
    },
  });

  // Las migraciones se aplican al arrancar, antes de escuchar (ADR-0007), y
  // /health/ready solo responde cuando la API llega a PostgreSQL y al broker:
  // la versión nueva no recibe tráfico hasta tener el esquema al día.
  const api = service('api', {
    source: imagen('api'),
    replicas: { [REGION]: 1 },
    networking: { serviceDomains: { 'api-production-f218.up.railway.app': { port: 3000 } } },
    healthcheck: '/health/ready',
    healthcheckTimeout: 120,
    env: {
      PORT: '3000',
      AUTH_ISSUER: preserve(),
      CORS_ORIGINS: preserve(),
      DATABASE_URL: preserve(),
      LOG_LEVEL: preserve(),
      MQTT_API_PASSWORD: preserve(),
      MQTT_URL: preserve(),
      REALTIME_TICKET_SECRET: preserve(),
      TRUST_PROXY_HOPS: preserve(),
    },
  });

  // Célula de demostración: publica por la red privada.
  const simulator = service('simulator', {
    source: imagen('simulator'),
    replicas: { [REGION]: 1 },
    env: {
      LOG_LEVEL: preserve(),
      MQTT_SIMULATOR_PASSWORD: preserve(),
      MQTT_URL: preserve(),
      SIMULATOR_CELL_ID: preserve(),
      SIMULATOR_SITE_ID: preserve(),
    },
  });

  const dashboard = service('dashboard', {
    source: imagen('dashboard'),
    replicas: { [REGION]: 1 },
    networking: { serviceDomains: { 'dashboard-production-6f89.up.railway.app': { port: 8080 } } },
    healthcheck: '/config.json',
    env: {
      PORT: '8080',
      API_URL: preserve(),
      AUTH_CLIENT_ID: preserve(),
      AUTH_ISSUER: preserve(),
    },
  });

  return project('logicflows', {
    resources: [Postgres, postgresVolume, brokerData, broker, identity, api, simulator, dashboard],
  });
});
