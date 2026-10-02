# Observabilidad: Grafana Cloud y registros

Cómo saber si LogicFlows funciona en producción sin entrar en los contenedores ([ADR-0013](../../docs/adr/0013-observabilidad.md)):

- **Métricas, panel y alertas** en Grafana Cloud, capa gratuita. Grafana recoge cada minuto las métricas de la API en `/metrics`.
- **Registros** de todos los servicios en el explorador de Railway.

| Fichero | Qué es |
|---|---|
| [`panel-produccion.json`](panel-produccion.json) | Panel «LogicFlows · Producción» |
| [`alertas.json`](alertas.json) | Grupo de alertas `logicflows` |
| [`aplicar.sh`](aplicar.sh) | Aplica la carpeta, el panel, el punto de contacto y las alertas. Se puede repetir |

Los ficheros son la fuente de verdad: un cambio hecho a mano en Grafana se pierde en la siguiente aplicación. Las alertas y el punto de contacto creados por el script no se pueden editar desde la web.

## Puesta en marcha

Lo hace una sola vez el titular de la cuenta.

1. **Crear la cuenta** en [grafana.com](https://grafana.com/auth/sign-up/create-user), en la capa *Free* (no pide tarjeta), con una pila en la región de la UE.
2. **Crear el token de las métricas** y guardarlo en Railway, sellado:

   ```sh
   openssl rand -hex 32
   ```

   En Railway: servicio `api` del entorno `production` → *Variables* → `METRICS_TOKEN` → *Seal*. Railway solo permite sellar desde la web. Al desplegar, `https://api-production-f218.up.railway.app/metrics` debe responder `401` sin el token.
3. **Configurar la recogida.** En Grafana: *Connections → Add new connection → Metrics Endpoint*:
   - *Scrape job name:* `logicflows-api`. El panel y las alertas filtran por este nombre.
   - *Scrape job URL:* `https://api-production-f218.up.railway.app/metrics`.
   - *Type of authentication credentials:* *Bearer*, con el token del paso 2 sin el prefijo `Bearer`.
   - *Scrape interval:* 1 minuto.
4. **Crear una cuenta de servicio** para el script: *Administration → Users and access → Service accounts*, con rol *Admin* y un token. Guardar el token en el gestor de contraseñas; no se guarda en el repositorio.
5. **Aplicar el panel y las alertas:**

   ```sh
   GRAFANA_URL=https://<pila>.grafana.net \
   GRAFANA_TOKEN=<token de la cuenta de servicio> \
   GRAFANA_ALERT_EMAIL=<correo que recibe las alertas> \
   infra/grafana/aplicar.sh
   ```

   El script busca el origen de datos Prometheus de la pila, `<pila>-prom`. Para usar otro, se indica con `GRAFANA_DATASOURCE_UID`.

Para cambiar el panel o las alertas, se editan los ficheros en una pull request y, al fusionarla, se vuelve a ejecutar el paso 5. Para rotar `METRICS_TOKEN`, se cambia primero en Railway y después en la integración. Mientras tanto se pierden las recogidas, y si tarda más de 5 minutos salta «API sin responder».

## El panel

*Dashboards → LogicFlows → LogicFlows · Producción*. Se actualiza cada minuto.

| Fila | Qué responde |
|---|---|
| **Estado de producción** | ¿Funciona todo? Si la API está sana y llega al broker y a PostgreSQL, cuántos visores hay conectados, si cada célula está conectada y publicando, su estado y las cajas por hora |
| **Ingesta MQTT** | ¿Llegan bien los mensajes? Recibidos por tipo, descartados por motivo, latencia (p50 y p95) y mensajes perdidos |
| **Proceso de la API** | ¿Tiene recursos la API? Memoria, CPU y retardo del bucle de eventos de cada réplica |

Cómo leer los casos habituales:

- **«API sana» en *Sin datos*.** Grafana no recibe métricas: la API no responde, o el token de la integración no coincide con el de Railway. En Grafana, *Connections → Metrics Endpoint* muestra el error de la última recogida.
- **Descartes `DUPLICATE`.** Son normales con QoS 1: el broker reenvía un mensaje si no recibió la confirmación. Los descartes `INVALID_*` indican un productor que no cumple el contrato, y su detalle está en los registros de la API.
- **Latencia alta justo después de un despliegue.** Mientras la API se reinicia, el broker guarda los mensajes en su sesión persistente. Al volver, la API los recibe con su marca de tiempo original. Si dura, revisar el reloj de la célula: la latencia incluye el desfase entre los dos relojes.
- **Mensajes perdidos en `telemetry`.** Son esperables con QoS 0, porque cada mensaje lleva los contadores acumulados. En `state` no deberían aparecer.

## Alertas

Llegan por correo al punto de contacto «LogicFlows · correo». Grafana evalúa cada minuto.

### API sin responder

Grafana no ha recibido métricas de la API en 5 minutos. Avisa a los 6 minutos de la caída.

1. Comprobar el servicio `api` en Railway: estado del despliegue y registros (`@service:api @level:error`).
2. Comprobar la salud desde fuera: `curl https://api-production-f218.up.railway.app/health/ready`.
3. Si la API responde y la alerta sigue, el problema está en la recogida: revisar el error en *Connections → Metrics Endpoint* y que el token coincida.
4. Si empezó con un despliegue, volver a la versión anterior ([Volver atrás](../../docs/despliegue.md#volver-atrás)).

### API sin una dependencia

La API responde, pero desde hace 2 minutos no llega al broker MQTT (`mqtt`) o a PostgreSQL (`database`), igual que `/health/ready`. Sin broker no recibe telemetría; sin base de datos no la guarda.

1. Comprobar el servicio de la dependencia en Railway (`broker` o `Postgres`) y sus registros.
2. La API se reconecta sola en cuanto la dependencia vuelve. No hace falta reiniciarla.

### Célula sin publicar

Una célula lleva más de 60 segundos sin enviar mensajes. La telemetría llega al menos cada 10 segundos (ADR-0004), así que no es una pausa normal.

1. En el panel, «Células conectadas» indica si la célula se desconectó del broker (su *Last Will*) o si sigue conectada sin publicar.
2. En producción, la célula es el simulador: revisar el servicio `simulator` en Railway.
3. Una célula real que se da de baja sigue alertando, porque la API la recupera de la base de datos. Mientras no exista una baja de células, se silencia la alerta para esa célula: *Alerting → Silences*, con `cell_id=<célula>`.

## Registros en Railway

Las tres aplicaciones escriben una línea JSON por evento con el campo `service` (`api`, `simulator`, `dashboard`). Railway las reúne en *Observability → Logs* del proyecto y las conserva 7 días en el plan Hobby. Consultas útiles:

| Consulta | Qué muestra |
|---|---|
| `@level:error` | Errores de cualquier servicio |
| `@service:api @level:warn` | Avisos de la API, como mensajes descartados o perdidos |
| `"Mensaje descartado"` | Descartes con su topic y su motivo |
| `@service:dashboard @res.statusCode:404` | Ficheros del visor que no existen |
| `@service:simulator "Cambio de estado"` | Historia de estados de la célula simulada |

El registro de accesos del visor no incluye la cadena de consulta: el retorno de OpenID Connect lleva el código de autorización en ella. El registro de errores de nginx es texto, porque nginx no permite darle formato. Las comprobaciones de salud y las recogidas de métricas no se registran.

## Probarlo en local

Con la API en marcha y `METRICS_TOKEN` en `.env`:

```sh
curl -H "Authorization: Bearer $METRICS_TOKEN" http://localhost:3000/metrics
```

Para probar el panel y las alertas, basta un Prometheus que recoja la API con el trabajo `logicflows-api` y un Grafana con ese Prometheus como origen de datos. El nombre del origen de datos debe terminar en `-prom`, o hay que indicar `GRAFANA_DATASOURCE_UID`. Después se ejecuta `aplicar.sh` contra ese Grafana.
