# LogicFlows

Plataforma IIoT para monitorizar en tiempo real células robotizadas de paletizado: estado de la máquina, producción y alarmas, desde la web y desde el móvil.

> **Estado:** en desarrollo. Hito actual: **Hito 1 · Primera caja en pantalla** (`v0.1.0`).

## Arquitectura

Un simulador de paletizadora publica telemetría por MQTT. Una API en NestJS la valida, la persiste en PostgreSQL y la expone por REST y WebSocket a un visor multiplataforma construido con Ionic y Angular.

## Documentación

- [Decisiones de arquitectura (ADR)](docs/adr/README.md)
- [Guía de contribución y Definition of Done](CONTRIBUTING.md)
