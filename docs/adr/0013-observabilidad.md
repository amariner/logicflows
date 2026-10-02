# ADR-0013: Observabilidad del sistema desplegado

- **Estado:** Aceptado
- **Fecha:** 2026-10-02
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-54

## Contexto

Desde el Hito 2, LogicFlows funciona en Railway (ADR-0008). Hoy, para saber si el sistema funciona hay que abrir el visor o leer los registros de cada servicio. Nadie se entera de que algo va mal hasta que lo ve.

LF-54 pide cuatro cosas:

1. Consultar en un único sitio los registros JSON de las tres aplicaciones.
2. Métricas de la API: mensajes recibidos, descartados por tipo, latencia de ingesta y clientes WebSocket conectados.
3. Una alerta cuando la API no está sana o una célula deja de publicar.
4. Un panel con el estado de producción y su documentación de uso.

Partimos de esta situación:

- **Registros.** La API y el simulador ya escriben JSON con pino. El visor (nginx) escribe texto. Railway reúne los registros de todos los servicios del proyecto en su explorador, interpreta el JSON y permite filtrar por campo (`@service:api`). Conserva 7 días en el plan Hobby. No tiene envío de registros a terceros (*log drains*).
- **Métricas y alertas.** Railway muestra CPU, memoria y red de cada servicio, pero no recoge métricas de la aplicación ni avisa de nada más. Un endpoint de métricas sin nadie que lo recoja solo enseña el valor del momento: sin histórico y sin alertas.
- **Coste.** El plan Hobby tiene un límite de gasto de 30 USD que, si se alcanza, detiene también producción (LF-44).

## Opciones consideradas

1. **Lo nativo de Railway y una vigilancia en GitHub Actions.** Los registros, en Railway. `/metrics` sin histórico. Un flujo programado cada pocos minutos comprueba la salud y la última señal de cada célula, y abre una incidencia si fallan, como la prueba de producción de LF-57.
2. **Grafana Cloud, capa gratuita.** La API expone sus métricas en formato Prometheus. Grafana Cloud las recoge cada minuto, guarda el histórico y evalúa las alertas. El panel se versiona en el repositorio. Los registros siguen en Railway.
3. **Prometheus y Grafana propios en Railway.** Dos o tres servicios más, con volumen, en el mismo proyecto.

## Decisión

1. **Las métricas de la API se exponen en formato Prometheus con `prom-client`**, en `GET /metrics`, fuera del prefijo `/api/v1` y del documento OpenAPI:
   - **Ingesta:** `logicflows_mqtt_messages_received_total{kind}`, `logicflows_mqtt_messages_discarded_total{kind,reason}`, `logicflows_mqtt_messages_missed_total{kind}` y el histograma `logicflows_ingestion_latency_seconds{kind}`.
   - **Tiempo real:** `logicflows_realtime_clients`, con los clientes conectados y autorizados.
   - **Salud:** `logicflows_dependency_up{dependency}`, con las mismas comprobaciones que `/health/ready`.
   - **Células:** `logicflows_cell_last_message_timestamp_seconds`, `logicflows_cell_online`, `logicflows_cell_state{state}`, `logicflows_cell_boxes` y `logicflows_cell_pallets`, por `site_id` y `cell_id`.
   - **Proceso:** las métricas estándar de Node.js (CPU, memoria, bucle de eventos).
2. **`/metrics` exige un token propio, `METRICS_TOKEN`.** Quien recoge las métricas es un servicio, no una persona, así que no usa los tokens de Keycloak. Sin la variable, la ruta responde 404: las previsualizaciones y el entorno local no la publican salvo que se pida.
3. **Grafana Cloud, en su capa gratuita, recoge, guarda y alerta.** Su integración *Metrics Endpoint* pide `/metrics` cada minuto con el token, con el trabajo `logicflows-api`. La cuenta la crea el Tech Lead, como la de Railway (ADR-0008).
4. **El panel y las alertas se describen en el repositorio** (`infra/grafana/`) y se aplican con `infra/grafana/aplicar.sh`, que se puede repetir. Las alertas son tres:
   - **API sin responder:** Grafana deja de recibir métricas durante 5 minutos.
   - **API sin una dependencia:** el broker o PostgreSQL no están disponibles durante 2 minutos.
   - **Célula sin publicar:** más de 60 segundos sin mensajes durante 1 minuto. La telemetría llega al menos cada 10 segundos (ADR-0004).

   Se avisa por correo.
5. **Los registros siguen en Railway, todos en JSON.** El visor escribe en JSON su registro de accesos. La API y el simulador escriben el nivel como texto (`"level":"info"`), que es lo que Railway sabe filtrar. No se envían registros a Grafana.

## Justificación

- **Cumple los cuatro criterios de verdad.** Con la opción 1, las métricas no tendrían histórico, y las alertas dependerían de la programación de GitHub Actions, que no es puntual: un flujo cada 5 minutos puede tardar bastante más en ejecutarse.
- **Coste cero con margen.** La capa gratuita no pide tarjeta, así que no hay sorpresas en la factura. Admite 10 000 series activas, 14 días de retención y 3 usuarios. La API genera del orden de cien o doscientas series, más 7 por célula. Nada consume el límite de gasto de Railway.
- **La instrumentación es estándar.** El formato de Prometheus lo entiende cualquier sistema de métricas. Cambiar de proveedor, o montar el nuestro (opción 3), no toca el código de la API.
- **Recoger desde fuera es más simple que enviar.** La API no guarda credenciales de Grafana ni depende de que Grafana esté disponible. Además, si la API deja de responder, eso mismo dispara una alerta.
- **Los registros ya cumplen el criterio en Railway.** Enviarlos a Grafana exigiría un reenviador (Vector o Fluent Bit) como servicio más, o que cada aplicación los enviara por su cuenta. Hoy no aporta nada que justifique ese coste.

## Alternativas descartadas

- **Railway y GitHub Actions (opción 1).** Sin cuentas nuevas y sencilla. Queda como plan B si Grafana Cloud dejara de ser gratuito o útil: el endpoint `/metrics` sirve igual.
- **Prometheus y Grafana propios (opción 3).** Dan control total y no dependen de un tercero, pero son dos o tres servicios más con volumen: más coste, copias de seguridad y actualizaciones. Es *overengineering* para un sistema con una célula.
- **OpenTelemetry con envío por OTLP.** Unifica métricas, trazas y registros, pero obliga a guardar credenciales de Grafana en la API y añade un SDK pesado. Lo reconsideraremos cuando haya trazas que seguir entre servicios.

## Consecuencias

- **Se sabe si producción funciona sin abrir el visor**, y llega un correo cuando deja de hacerlo.
- **La latencia de ingesta se mide desde la marca de tiempo de la célula.** Incluye el desfase de reloj entre la célula y la API y el tiempo que un mensaje espera en el broker si la API estaba parada. Si el reloj de la célula va adelantado, la latencia se queda en 0. Los mensajes retenidos no se miden.
- **Con varias réplicas de la API**, Railway reparte cada recogida entre ellas y cada minuto se ve solo una. La etiqueta `replica` lo distingue. Hoy hay una réplica. Si se escala, habrá que recoger de cada réplica o enviar las métricas.
- **Una célula dada de baja sigue alertando**, porque la API la recupera de la base de datos al arrancar. Dar de baja una célula tendrá que borrar sus datos o silenciar la alerta.
- **Hay un secreto más, `METRICS_TOKEN`.** Vive sellado en Railway y en la configuración de la integración en Grafana. Rotarlo exige cambiarlo en los dos sitios.
- **Hay un proveedor más.** Si Grafana Cloud cae, perdemos las alertas mientras dure la caída, pero no el sistema. La prueba de producción de LF-57 sigue funcionando por su cuenta.
- **El registro de errores de nginx sigue en texto**: nginx no permite darle formato.

## Criterios de revisión

- La API pasa a tener más de una réplica.
- Las series superan la mitad del límite gratuito: más de 5 000.
- Hace falta conservar las métricas más de 14 días, o los registros más de 7.
- Se necesitan trazas entre servicios, o registros consultables junto a las métricas.
