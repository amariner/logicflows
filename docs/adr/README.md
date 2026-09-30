# Decisiones de arquitectura

Este directorio recoge las decisiones de arquitectura de LogicFlows como ADR (*Architecture Decision Record*). Cada ADR explica el contexto, las alternativas consideradas, la decisión tomada, sus consecuencias y en qué circunstancias debe revisarse.

Un ADR aceptado no se reescribe. Si la decisión cambia, se crea un ADR nuevo que lo sustituye y se actualiza el estado del anterior.

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [0001](0001-gestor-de-paquetes-y-orquestacion.md) | Gestor de paquetes y orquestación del monorepo | Aceptado |

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
