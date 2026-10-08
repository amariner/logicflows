// Infraestructura de LogicFlows en Railway (ADR-0011): servicios, imágenes,
// dominios, volúmenes y comprobaciones de salud de cada entorno.
//
// Hay dos tipos de entorno:
// - production: cada cambio llega por pull request; la CI publica el plan en
//   la PR y, al fusionarla, aplica exactamente ese plan. Desplegar una versión
//   es cambiar VERSION por una etiqueta ya promocionada en GitHub Container
//   Registry (vX.Y.Z), nunca por una que haya que compilar. Volver atrás es
//   devolver VERSION a la etiqueta anterior. Los secretos no están aquí:
//   preserve() conserva el valor sellado que ya tiene cada variable en Railway
//   (docs/despliegue.md).
// - pr-<número>: la previsualización de una pull request (ADR-0012). La crea,
//   actualiza y borra infra/railway/previsualizacion.sh, que da las imágenes
//   de la PR (LOGICFLOWS_IMAGE_TAG), la semilla de los secretos
//   (PREVIEW_SECRETS_SEED) y la contraseña del usuario de prueba (E2E_PASSWORD).
//   No hereda nada de producción.
import { createHmac } from 'node:crypto';
import { defineRailway, image, postgres, preserve, project, service, volume } from 'railway/iac';

/** Versión desplegada en producción: etiqueta de las imágenes en GHCR. */
const VERSION = 'sha-4445cc2';

/** Ámsterdam: latencia baja desde España y datos dentro de la UE. */
const REGION = 'europe-west4-drams3a';

/** Variable de entorno obligatoria al evaluar el fichero para una previsualización. */
function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name} (infra/railway/previsualizacion.sh)`);
  }
  return value;
}

export default defineRailway((ctx) => {
  const environment = ctx.environmentName ?? '';
  const production = environment === 'production';
  if (!production && !/^pr-\d+$/.test(environment)) {
    throw new Error(`Entorno no previsto: «${environment}». Solo production o pr-<número>.`);
  }

  const tag = production ? VERSION : required('LOGICFLOWS_IMAGE_TAG');
  const imagen = (app: string) => image(`ghcr.io/amariner/logicflows-${app}:${tag}`);

  // Dominios: los de producción los asignó Railway; los de una previsualización
  // se derivan de su nombre, así que se conocen antes de desplegar.
  const domain = (app: string, productionDomain: string) =>
    production ? productionDomain : `logicflows-${environment}-${app}.up.railway.app`;
  const brokerDomain = domain('broker', 'broker-production-c580.up.railway.app');
  const identityDomain = domain('identity', 'identity-production-e786.up.railway.app');
  const apiDomain = domain('api', 'api-production-f218.up.railway.app');
  const dashboardDomain = domain('dashboard', 'dashboard-production-6f89.up.railway.app');

  // En producción, las variables se conservan como están en Railway. En una
  // previsualización se fijan aquí, con los dominios del propio entorno.
  const config = (value: string) => (production ? preserve() : value);

  // Secretos de una previsualización: HMAC del entorno y el nombre con una
  // semilla que solo tiene la CI. Distintos en cada PR, estables entre commits
  // y sin estado que guardar (ADR-0012). previsualizacion.sh calcula igual las
  // contraseñas de PostgreSQL.
  const previewSecret = (name: string) =>
    createHmac('sha256', required('PREVIEW_SECRETS_SEED'))
      .update(`${environment}:${name}`)
      .digest('hex');
  const secret = (name: string) => (production ? preserve() : previewSecret(name));

  const visorUrl = `https://${dashboardDomain}`;
  const issuer = `https://${identityDomain}/realms/logicflows`;
  const mqttUrl = 'mqtt://broker.railway.internal:1883';

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
    networking: { serviceDomains: { [brokerDomain]: { port: 9001 } } },
    env: {
      MQTT_API_PASSWORD: secret('mqtt-api'),
      MQTT_SIMULATOR_PASSWORD: secret('mqtt-simulator'),
    },
  });

  // En las previsualizaciones, Keycloak usa la imagen con el usuario de la
  // prueba de extremo a extremo (identity-preview), publicada con la etiqueta
  // de la PR. La de producción no tiene usuarios (ADR-0010).
  const identity = service('identity', {
    source: imagen('identity'),
    start: '',
    replicas: { [REGION]: 1 },
    networking: { serviceDomains: { [identityDomain]: { port: 8080 } } },
    // El documento de descubrimiento existe cuando Keycloak ha arrancado y
    // tiene el realm importado.
    healthcheck: '/realms/logicflows/.well-known/openid-configuration',
    healthcheckTimeout: 300,
    env: {
      PORT: '8080',
      KC_DB_PASSWORD: secret('db-keycloak'),
      KC_DB_URL: config('jdbc:postgresql://postgres.railway.internal:5432/keycloak'),
      KC_DB_USERNAME: config('keycloak'),
      KC_HOSTNAME: config(`https://${identityDomain}`),
      LOGICFLOWS_VISOR_URL: config(visorUrl),
      ...(production ? {} : { LOGICFLOWS_E2E_PASSWORD: required('E2E_PASSWORD') }),
    },
  });

  // Las migraciones se aplican al arrancar, antes de escuchar (ADR-0007), y
  // /health/ready solo responde cuando la API llega a PostgreSQL y al broker:
  // la versión nueva no recibe tráfico hasta tener el esquema al día.
  const api = service('api', {
    source: imagen('api'),
    replicas: { [REGION]: 1 },
    networking: { serviceDomains: { [apiDomain]: { port: 3000 } } },
    healthcheck: '/health/ready',
    healthcheckTimeout: 120,
    env: {
      PORT: '3000',
      AUTH_ISSUER: config(issuer),
      CORS_ORIGINS: config(visorUrl),
      DATABASE_URL: production
        ? preserve()
        : `postgresql://logicflows:${previewSecret('db-api')}@postgres.railway.internal:5432/logicflows`,
      // Ventana fija de la demo (ADR-0019): en producción, 2 días en bruto y 31
      // de estados y agregados. Las previsualizaciones duran poco y no la acotan.
      HISTORY_RAW_RETENTION_DAYS: config('0'),
      HISTORY_EVENTS_RETENTION_DAYS: config('0'),
      HISTORY_AGGREGATES_RETENTION_DAYS: config('0'),
      LOG_LEVEL: config('info'),
      // Token con el que Grafana Cloud recoge /metrics (ADR-0013). Solo en
      // producción: sin la variable, la ruta no existe.
      ...(production ? { METRICS_TOKEN: preserve() } : {}),
      // Cuenta de servicio de Firebase para los avisos de alarmas (ADR-0015).
      // Solo en producción: sin la variable no se envían avisos.
      ...(production ? { FCM_SERVICE_ACCOUNT: preserve() } : {}),
      MQTT_API_PASSWORD: secret('mqtt-api'),
      MQTT_URL: config(mqttUrl),
      REALTIME_TICKET_SECRET: secret('tiques'),
      TRUST_PROXY_HOPS: config('1'),
    },
  });

  // Célula de demostración: publica por la red privada.
  const simulator = service('simulator', {
    source: imagen('simulator'),
    replicas: { [REGION]: 1 },
    env: {
      LOG_LEVEL: config('info'),
      MQTT_SIMULATOR_PASSWORD: secret('mqtt-simulator'),
      MQTT_URL: config(mqttUrl),
      SIMULATOR_CELL_ID: config('cell-01'),
      // Producción simula cuatro células en este mismo servicio, sin coste
      // añadido (LF-123). Las previsualizaciones, una: sus pruebas usan cell-01.
      SIMULATOR_CELLS: config('cell-01'),
      // En producción, el guion diario de la demo con semilla fija (ADR-0019).
      // Las previsualizaciones siguen en «normal»: sus pruebas no esperan paradas.
      SIMULATOR_SCENARIO: config('normal'),
      SIMULATOR_SEED: config('7'),
      SIMULATOR_SITE_ID: config('demo'),
    },
  });

  const dashboard = service('dashboard', {
    source: imagen('dashboard'),
    replicas: { [REGION]: 1 },
    networking: { serviceDomains: { [dashboardDomain]: { port: 8080 } } },
    healthcheck: '/config.json',
    env: {
      PORT: '8080',
      API_URL: config(`https://${apiDomain}`),
      AUTH_CLIENT_ID: config('logicflows-visor'),
      AUTH_ISSUER: config(issuer),
    },
  });

  return project('logicflows', {
    resources: [Postgres, postgresVolume, brokerData, broker, identity, api, simulator, dashboard],
  });
});
