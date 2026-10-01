# ADR-0011: Infraestructura de Railway como código

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-49

## Contexto

Producción funciona en Railway (ADR-0008) con seis servicios. Hasta LF-48 se configuró a mano, desde la web y la CLI: imágenes, regiones, dominios, volúmenes y variables. Para desplegar versiones (LF-49) faltaban cuatro cosas:

- **Saber qué hay en producción** sin entrar en el panel, y detectar los cambios que nadie ha registrado.
- **Desplegar una versión** cambiando las imágenes de los cinco servicios a la vez, sin recompilar (LF-45).
- **Volver atrás** de forma rápida y probada.
- **Revisar cada cambio** de infraestructura como se revisa el código.

Las previsualizaciones por pull request (LF-53) necesitarán además describir el entorno de forma repetible.

## Opciones consideradas

1. **Script con la CLI de Railway.** Un script que cambia la imagen de cada servicio y despliega.
2. **Infraestructura como código nativa de Railway** (`railway config`). Un fichero TypeScript (`.railway/railway.ts`) describe el proyecto. `railway config plan` calcula las diferencias con el entorno real y `apply` las aplica. La acción oficial `railwayapp/config` publica el plan en cada pull request y, al fusionarla, aplica ese mismo plan.
3. **Terraform** con el proveedor de Railway.

## Decisión

Se adopta la **opción 2**:

- **Qué se describe.** `.railway/railway.ts` declara los servicios, las imágenes, las réplicas por región, los dominios, los volúmenes, las comprobaciones de salud y las variables de producción.
- **Los secretos se quedan en Railway.** El fichero solo declara que existen con `preserve()`, que conserva el valor sellado (LF-48). Ningún secreto pasa por el repositorio ni por la CI.
- **La versión está en el fichero.** La constante `VERSION` es la etiqueta de las imágenes en GHCR. Desplegar es cambiarla en una pull request; volver atrás es devolverla a la anterior.
- **Todo cambio llega por pull request.** `Railway plan` comenta el plan en la PR y lo fija como artefacto. Al fusionar, `Railway apply` aplica ese plan. Si el entorno cambió desde que se calculó, o lo fusionado no es lo planificado, falla y hay que volver a planificar.
- **Comprobaciones de salud.** Railway no envía tráfico a un despliegue hasta que su comprobación responde: `/health/ready` en la API, el documento de descubrimiento del realm en Keycloak y `/config.json` en el visor. La API aplica las migraciones antes de escuchar (ADR-0007), así que una versión nueva no recibe tráfico sin el esquema al día.

## Justificación

- **Valida la hipótesis antes de decidir.** En un spike, `railway config pull` importó la producción real y `plan` no encontró ninguna diferencia. Después se aplicaron los cambios de LF-49 y se probó en producción la vuelta atrás completa, en unos dos minutos.
- **Es la herramienta del proveedor.** Cubre lo que usa LogicFlows, incluidos los volúmenes, los dominios, las comprobaciones de salud y los secretos sellados, sin capa intermedia.
- **El plan fijado hace que la revisión tenga sentido.** Lo que se aprueba en la PR es exactamente lo que se aplica.
- **Detecta desviaciones.** `pnpm railway:plan` muestra cualquier cambio hecho a mano que no esté en el repositorio.
- **Mismo lenguaje que el producto.** TypeScript, con comprobación de tipos y lint en `pnpm check`.

## Alternativas descartadas

- **Script con la CLI:** es imperativo. Dice qué hacer, pero no qué debería haber, así que no detecta desviaciones ni permite revisar un plan. Habría que mantener a mano la lista de servicios y opciones.
- **Terraform:** el proveedor de Railway es comunitario, no oficial, y va por detrás de la plataforma. Añade un estado que hay que guardar y proteger, y una herramienta y un lenguaje más, para un único proveedor. Se reconsideraría con varios proveedores.

## Consecuencias

- **Positivas:** la producción está descrita y revisada en el repositorio. Desplegar y volver atrás es una PR de una línea, con el plan visible antes de aplicar.
- **Coste:** un token de proyecto de Railway en GitHub (`RAILWAY_TOKEN`, entorno `production`). Lo crea y lo rota el titular de la cuenta.
- **Riesgo asumido:** el SDK (`railway` 3.12) es joven. Se fija su versión exacta y se comprueba con `plan` antes de cada actualización. Dos limitaciones detectadas en el spike:
  - Un dominio generado de Railway no se crea desde el fichero. Se crea con `railway domain` y después se declara con su nombre.
  - El montaje de un volumen se declara con la ruta como clave: `{ '/ruta': volumen }`.
- **Volver atrás no deshace migraciones.** Volver a una versión anterior solo es seguro si las migraciones son compatibles con la versión previa. Por eso cada migración debe ser aditiva: primero se amplía el esquema y, en una versión posterior, se retira lo que sobra.
- **Los cambios urgentes desde el panel siguen siendo posibles**, por ejemplo redesplegar un despliegue anterior. Después deben reflejarse en una PR, o el siguiente plan los revertirá.

## Criterios de revisión

- El SDK o la acción dejan de mantenerse o rompen la compatibilidad de forma repetida.
- LogicFlows pasa a usar varios proveedores de infraestructura.
- Las previsualizaciones (LF-53) no se pueden describir con este fichero.
