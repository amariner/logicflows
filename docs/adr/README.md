# Decisiones de arquitectura

Este directorio recoge las decisiones de arquitectura de LogicFlows como ADR (*Architecture Decision Record*). Cada ADR explica el contexto, las alternativas consideradas, la decisión tomada, sus consecuencias y en qué circunstancias debe revisarse.

Un ADR aceptado no se reescribe. Si la decisión cambia, se crea un ADR nuevo que lo sustituye y se actualiza el estado del anterior.

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-gestor-de-paquetes-y-orquestacion.md) | Gestor de paquetes y orquestación del monorepo | Aceptado |
| [0002](0002-visor-multiplataforma.md) | Visor multiplataforma con Ionic, Angular y Capacitor | Aceptado |
| [0003](0003-estados-de-la-paletizadora.md) | Estados y transiciones de la paletizadora | Aceptado |
| [0004](0004-mensajes-de-telemetria-y-topics-mqtt.md) | Mensajes de telemetría, topics MQTT y broker | Aceptado |
| [0005](0005-paquete-del-contrato.md) | Paquete compartido del contrato de telemetría | Aceptado |
| [0006](0006-canal-de-tiempo-real.md) | Canal de tiempo real entre la API y el visor | Aceptado |
| [0007](0007-acceso-a-datos-y-migraciones.md) | Acceso a datos y migraciones | Aceptado |
| [0008](0008-plataforma-de-despliegue.md) | Plataforma de despliegue | Aceptado; previsualizaciones sustituidas por ADR-0012 |
| [0009](0009-autenticacion-y-autorizacion.md) | Autenticación y autorización | Aceptado |
| [0010](0010-imagenes-de-la-infraestructura.md) | Imágenes del broker y del proveedor de identidad | Aceptado |
| [0011](0011-infraestructura-como-codigo.md) | Infraestructura de Railway como código | Aceptado |
| [0012](0012-previsualizaciones-por-pull-request.md) | Previsualizaciones por pull request | Aceptado |
| [0013](0013-observabilidad.md) | Observabilidad del sistema desplegado | Aceptado |

## Estados

- **Propuesto:** en discusión.
- **Aceptado:** decisión vigente.
- **Sustituido:** reemplazado por un ADR posterior, que se indica.
- **Descartado:** se evaluó y no se adoptó.

## Plantilla

```markdown
# ADR-NNNN: Título

- **Estado:** Propuesto | Aceptado | Sustituido por ADR-NNNN | Descartado
- **Fecha:** AAAA-MM-DD
- **Responsable:** nombre y rol
- **Tarea:** LF-N

## Contexto

Problema que se resuelve y restricciones relevantes.

## Opciones consideradas

Alternativas evaluadas.

## Decisión

Qué se decide, de forma concreta y verificable.

## Justificación

Por qué esta opción frente a las demás.

## Alternativas descartadas

Qué aporta cada alternativa y por qué no se elige ahora.

## Consecuencias

Efectos positivos, costes y riesgos asumidos.

## Criterios de revisión

Condiciones que obligarían a reconsiderar la decisión.
```
