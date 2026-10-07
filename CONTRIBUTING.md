# Guía de contribución

Esta guía define cómo llega un cambio a `main` en LogicFlows. Su objetivo es que todo el trabajo tenga la misma calidad y sea trazable: cada tarea de Jira muestra el código que la resuelve y cada cambio del código explica por qué existe.

## Flujo de trabajo

1. **Tarea en Jira.** Todo cambio parte de una tarea del proyecto [LF](https://logicflows.atlassian.net/jira/software/projects/LF/boards/1) con criterios de aceptación. Si no existe, se crea y se prioriza antes de empezar.
2. **Rama.** Se crea desde `main` actualizada y se mueve la tarea a *En curso*.
3. **Commits.** Pequeños y coherentes, con el formato descrito más abajo.
4. **Pull request.** Se abre cuando el cambio cumple la [Definition of Done](#definition-of-done) y se mueve la tarea a *En revisión*.
5. **Revisión.** El Tech Lead revisa todas las pull requests. Los comentarios se resuelven con nuevos commits en la misma rama.
6. **Fusión.** Tras la aprobación, la pull request se fusiona y la tarea pasa a *Finalizado* con un comentario que resume el resultado.

## Ramas

Las ramas son cortas, parten de `main` y siguen el formato `tipo/LF-N-descripcion`, con la descripción en minúsculas y separada por guiones.

| Tipo | Uso | Ejemplo |
|---|---|---|
| `feature` | Funcionalidad o tarea técnica | `feature/LF-26-ingesta-telemetria` |
| `fix` | Corrección de un error | `fix/LF-36-reconexion-websocket` |
| `docs` | Documentación y ADR | `docs/LF-12-adr-visor` |
| `spike` | Prueba de concepto. **No se fusiona**: se conserva como evidencia de una decisión | `spike/LF-12-capacitor-pnpm` |

## Commits

Se sigue [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/). La descripción se escribe en español, en imperativo o presente y sin punto final. El cuerpo explica el porqué cuando no es evidente, y el pie referencia la tarea.

```text
feat(api): valida los mensajes de telemetría recibidos

Descarta los mensajes que no cumplen el contrato y registra un aviso
sin detener la suscripción.

Refs: LF-26
```

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de un error |
| `docs` | Documentación y ADR |
| `test` | Pruebas |
| `refactor` | Cambio interno sin alterar el comportamiento |
| `build` | Dependencias y empaquetado |
| `ci` | Integración continua |
| `chore` | Mantenimiento sin impacto en el producto |

El ámbito indica el paquete afectado: `simulator`, `api`, `dashboard`, `contract` o `infra`. Se omite si el cambio afecta a todo el repositorio.

Un commit debe compilar y pasar las pruebas por sí mismo. Los cambios de formato o de dependencias no se mezclan con cambios de lógica.

## Pull requests

- **Título:** `LF-N: descripción`, por ejemplo `LF-26: validación de los mensajes de telemetría`.
- **Descripción:** se completa la [plantilla](.github/pull_request_template.md): objetivo, cambios, cómo revisar y comprobaciones.
- **Tamaño:** una pull request resuelve una tarea. Si supera unas 400 líneas de cambios que no sean generados, se valora dividirla.
- **Borradores:** una pull request en borrador sirve para pedir opinión temprana; no se revisa para fusionar.

## Estrategia de fusión

Las pull requests se integran con **rebase** (*Rebase and merge*), sin commits de fusión:

- `main` mantiene un **historial lineal**, fácil de leer y de recorrer con `git bisect`.
- Se conservan los **commits individuales** de la rama, cada uno con su tipo, su descripción y su referencia a Jira.
- La rama se elimina automáticamente tras la fusión.

Por eso los commits de una rama deben estar limpios antes de pedir la revisión: si hay commits de corrección intermedios, se reorganizan en la propia rama.

Se descartan la fusión con commit de fusión, porque ensucia el historial con commits sin valor, y la fusión con *squash*, porque reduce cada pull request a un único commit y pierde el detalle de los cambios.

### Protección de `main`

Un conjunto de reglas del repositorio («Proteger main») hace obligatorias estas normas, sin excepciones para administradores:

- Los cambios llegan a `main` solo mediante pull request y solo con *Rebase and merge*.
- Para fusionar, las cuatro comprobaciones de la [CI](.github/workflows/ci.yml) deben estar en verde: *Comprobaciones*, *Integración*, *Accesibilidad* y *Sistema completo*.
- Las conversaciones de la revisión deben estar resueltas.
- `main` no admite *force push* ni se puede borrar, y su historial es lineal.

La aprobación de la revisión se da en la conversación de la pull request y no se exige como aprobación formal de GitHub, porque el autor no puede aprobar su propia pull request. Tampoco se exige que la rama esté al día con `main` antes de fusionar: el rebase la actualiza y la CI vuelve a ejecutarse sobre `main` tras cada fusión.

### Auditoría de dependencias

Los avisos de seguridad se publican en cualquier momento, aunque el código no cambie. Para que un aviso nuevo no bloquee pull requests ajenas a las dependencias:

- La CI audita una pull request (`pnpm audit --audit-level high`) **solo si cambia `pnpm-lock.yaml`**. Si no lo cambia, el paso aparece como omitido: sin cambiar las dependencias, la pull request no puede introducir una vulnerabilidad.
- La auditoría completa se ejecuta en cada push a `main` y **cada día** en su propio [flujo de trabajo](.github/workflows/auditoria.yml). Si encuentra un aviso alto o crítico, abre o actualiza una incidencia de GitHub. La corrección se planifica en Jira como cualquier tarea.
- El umbral es `high`, sin excepciones. Un aviso se corrige actualizando la dependencia, no bajando el umbral.

## Definition of Done

Una tarea está terminada cuando se cumple todo lo que le aplica:

- [ ] Los **criterios de aceptación** de la tarea de Jira se cumplen.
- [ ] El código nuevo tiene **pruebas automatizadas** proporcionales a su riesgo, según la [estrategia de pruebas](docs/estrategia-de-pruebas.md), y las comprobaciones del repositorio (tipos, lint, formato y pruebas) pasan.
- [ ] La **integración continua** está en verde.
- [ ] El **Tech Lead ha aprobado** la pull request.
- [ ] La **documentación** está actualizada: `README` o documentación técnica si cambia el uso, un ADR si se ha tomado una decisión de arquitectura y Confluence si afecta al producto o al equipo.
- [ ] En la **interfaz**: accesible según WCAG 2.2 AA (uso con teclado, foco visible, contraste, etiquetas y textos alternativos) y comprobada en móvil y en escritorio.
- [ ] **Sin secretos** en el repositorio: la configuración dependiente del entorno se inyecta mediante variables de entorno y se documenta en `.env.example`.
- [ ] La tarea de Jira está **actualizada y enlazada** con la rama, los commits y la pull request.
