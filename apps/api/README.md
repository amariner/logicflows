# API

Única puerta de entrada de los datos de planta: se suscribe a la telemetría MQTT, la valida contra el contrato, la persiste en PostgreSQL y la expone por REST y WebSocket.

NestJS y TypeScript. El esqueleto, con comprobación de salud, logs estructurados y OpenAPI, se implementa en LF-23.
