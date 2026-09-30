# ADR-0007: Acceso a datos y migraciones

- **Estado:** Aceptado
- **Fecha:** 2026-10-01
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-32

## Contexto

La API debe conservar en PostgreSQL el estado y la producción de las células para consultarlos (LF-33), recuperarlos tras un reinicio y, en el Hito 4, analizarlos. Requisitos:

- **Esquema versionado:** cada cambio del esquema es una migración revisable en la pull request y aplicada igual en todos los entornos.
- **Idempotencia:** un mensaje duplicado o reenviado no puede duplicar la producción registrada (ADR-0004).
- **Consultas analíticas en SQL:** la producción por periodo se calcula por diferencias de contadores acumulados, con funciones de ventana. El acceso a datos no debe esconder el SQL.
- **Tipos de extremo a extremo** con TypeScript estricto y módulos ES.
- Pocas dependencias y sin pasos de generación de código que olvidar.

## Opciones consideradas

1. **Drizzle ORM** con `drizzle-kit` para las migraciones.
2. **Prisma.**
3. **TypeORM**, la opción clásica en la documentación de NestJS.
4. **Kysely**, constructor de consultas tipado, con migraciones propias.
5. **SQL directo** con `pg` y una herramienta de migraciones como `node-pg-migrate`.

## Decisión

1. Acceso a datos con **Drizzle ORM** sobre el controlador **`pg`**, con el esquema definido en TypeScript.
2. **Migraciones SQL** generadas con `drizzle-kit` a partir del esquema, versionadas en `apps/api/drizzle/` y revisadas como cualquier otro código. Nunca se modifica una migración ya fusionada: se añade otra.
3. En el Hito 1, **la API aplica las migraciones pendientes al arrancar**, antes de atender peticiones. Con varias instancias (Hito 2) pasarán a un paso previo del despliegue.
4. **Idempotencia en la base de datos:** cada tabla de mensajes tiene una restricción única sobre la identidad del mensaje (planta, célula, sesión y secuencia) y se inserta con `ON CONFLICT DO NOTHING`. La base de datos, no el código, garantiza que un duplicado no cuenta dos veces.
5. **Modelo de datos del Hito 1:**
   - `cell_status_events`: cambios de conexión de cada célula.
   - `cell_state_changes`: historial de estados con sus alarmas activas.
   - `telemetry_samples`: cada telemetría recibida, con sus contadores acumulados.
   La producción de un periodo se calcula a partir de las diferencias entre muestras consecutivas de cada sesión. El almacenamiento del histórico a largo plazo (retención, agregación, base de series temporales) se decidirá en el Hito 4.

## Justificación

**Drizzle frente a Prisma.** Prisma ofrece una experiencia excelente y es muy popular, pero define el esquema en un lenguaje propio, genera el cliente en un paso aparte (un `postinstall` que la política de dependencias bloquearía) y su API de consultas se aleja del SQL. Las consultas de producción por ventanas de tiempo acabarían en SQL en bruto. Drizzle define el esquema en TypeScript, escribe consultas con una sintaxis cercana al SQL con tipos completos y permite mezclar SQL cuando hace falta sin perder los tipos.

**Drizzle frente a TypeORM.** TypeORM encaja con los decoradores de NestJS, pero sus tipos son débiles (las relaciones y los resultados de consultas complejas acaban en `any`), la generación de migraciones es frágil y su mantenimiento ha sido irregular.

**Drizzle frente a Kysely o SQL directo.** Kysely es un constructor de consultas excelente, pero no genera migraciones a partir de un esquema. El SQL directo da el máximo control a cambio de escribir y mantener a mano los tipos de cada consulta. Drizzle ofrece el mismo control sobre el SQL con el esquema como única fuente de verdad para los tipos y las migraciones.

**Migraciones en SQL.** Las migraciones generadas son ficheros SQL legibles: la revisión ve exactamente qué cambia en la base de datos.

**Idempotencia con restricciones únicas.** La guardia de secuencia de la API ya descarta duplicados en memoria, pero se pierde al reiniciar y no protege frente a reprocesar mensajes retenidos. La restricción única hace imposible duplicar datos aunque falle cualquier otra capa.

## Alternativas descartadas

**Prisma.** Preferible en equipos que priorizan la productividad en operaciones CRUD y prefieren no escribir SQL.

**TypeORM.** Solo se reconsideraría para alinearse con un equipo que ya lo use.

**Kysely y SQL directo.** Válidos si la generación de migraciones desde un esquema dejara de aportar valor.

## Consecuencias

**Positivas:**

- Tipos derivados del esquema en todas las consultas.
- Migraciones SQL revisables y aplicadas automáticamente en local, en las pruebas y en el arranque.
- Idempotencia garantizada por la base de datos.
- Consultas analíticas en SQL sin salir del acceso a datos tipado.

**Costes y riesgos:**

- Drizzle aún no ha publicado la versión 1.0: puede haber cambios incompatibles entre versiones menores.
- Aplicar migraciones al arrancar no es seguro con varias instancias a la vez; se cambiará en el Hito 2.
- `telemetry_samples` crece con cada caja (del orden de 10⁶ filas por célula y año). Es asumible en el Hito 1; la retención y la agregación se deciden en el Hito 4.

## Criterios de revisión

- Drizzle introduce cambios incompatibles frecuentes o se abandona.
- El volumen de telemetría degrada las consultas o el almacenamiento (Hito 4).
- Se despliegan varias instancias de la API (Hito 2): las migraciones pasan a un paso del despliegue.

## Referencias

- [Drizzle ORM](https://orm.drizzle.team/)
- [Migraciones con drizzle-kit](https://orm.drizzle.team/docs/kit-overview)
- [INSERT … ON CONFLICT en PostgreSQL](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
- [Funciones de ventana en PostgreSQL](https://www.postgresql.org/docs/current/tutorial-window.html)
