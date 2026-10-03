# ADR-0017: Copias de seguridad de PostgreSQL

- **Estado:** Aceptado; no activado en la demo (actualización del 4 de octubre de 2026)
- **Fecha:** 2026-10-03
- **Responsable:** Andreu Mariner, Tech Lead
- **Tarea:** LF-82

## Contexto

Hasta el Hito 3, perder la base de datos de producción solo costaba el estado actual, que las células vuelven a enviar. Con el histórico agregado (ADR-0016) ya no es así:

- los agregados por hora no se pueden reconstruir desde las células;
- cuando se active la retención, el dato en bruto de más de 30 días desaparecerá.

Además, la misma instancia de PostgreSQL guarda los usuarios y la configuración de Keycloak (base de datos `keycloak`).

Hoy no hay copias de seguridad. LF-82 pide:

- copias con frecuencia y retención acordadas y su coste identificado;
- una restauración probada en un entorno aparte, con el tiempo que lleva;
- un procedimiento y una alerta si una copia falla.

PostgreSQL solo es accesible desde la red privada de Railway (LF-48), y así debe seguir.

## Opciones consideradas

1. **Copias nativas de los volúmenes de Railway.** Instantáneas diarias, semanales o mensuales del volumen de PostgreSQL, declaradas en la infraestructura como código (`backupSchedules`).
2. **Volcados lógicos propios en un bucket de Railway.** Un servicio programado de Railway ejecuta `pg_dump` de cada base de datos y lo sube a un bucket del mismo proyecto. Una restauración de prueba diaria descarga el último volcado y lo restaura en un PostgreSQL desechable.
3. **Volcados lógicos en un proveedor externo** (S3, R2 o B2), con la misma mecánica que la opción 2.

## Decisión

Las opciones 2 y 1, por este orden:

1. **Volcado lógico diario** (opción 2) de las bases de datos `logicflows` y `keycloak`:
   - **Cuándo y cuánto:** a las 03:00 UTC, en formato comprimido de `pg_dump`, con **30 días** de retención.
   - **Dónde:** en un bucket privado de Railway.
   - **Cómo:** lo ejecuta `infra/copias/copiar.sh` en la imagen `logicflows-backup`, como servicio programado (*cron*) de Railway.
   - **Pérdida máxima:** un día de histórico.
2. **Restauración de prueba diaria,** que también sirve de alerta. Un flujo de GitHub Actions lanza `infra/copias/probar-restauracion.sh` en un servicio temporal de Railway, como ya hace `ejecutar-sql.sh`. El script:
   - comprueba que el último volcado de cada base de datos tiene menos de 26 horas;
   - lo restaura en un PostgreSQL desechable dentro del propio contenedor;
   - comprueba las tablas y mide cuánto tarda.

   Si algo falla, el flujo abre una incidencia en GitHub, como la prueba de producción (LF-57).
3. **Copias nativas del volumen** (opción 1), diarias y semanales, como complemento. Recuperan el servidor entero en minutos desde Railway, Keycloak incluido, pero no se pueden restaurar en otro sitio ni probarse sin tocar producción.

## Justificación

- **Probar la restauración es lo que da valor a una copia.** El volcado lógico se restaura en cualquier PostgreSQL 18, y la prueba diaria demuestra cada día que la última copia sirve, sin tocar producción.
- **Los datos no salen de Railway** y PostgreSQL sigue sin acceso público: el volcado y la prueba se ejecutan en la red privada, y el bucket es privado.
- **Sin cuentas nuevas.** El bucket y el servicio programado son recursos del mismo proyecto, declarados como código (ADR-0011). Un proveedor externo (opción 3) añadiría otra cuenta, otras credenciales y otra factura.
- **La alerta no depende de que el servicio programado avise.** Si el volcado no se ejecuta, la prueba encuentra una copia antigua y falla.

## Alternativas descartadas

- **Solo copias nativas de Railway (opción 1).** No cumplen «restauración probada en un entorno aparte»: se restauran sobre el mismo servicio, sustituyendo sus datos. Tampoco avisan si no se hacen.
- **Proveedor externo (opción 3).** Protegería ante la pérdida del proyecto de Railway entero, pero con otra cuenta que mantener. Se reconsiderará si el riesgo de perder la cuenta de Railway pasa a importar.

## Consecuencias

- **Coste:** el bucket, unos minutos de servicio programado al día y las instantáneas del volumen. Con el tamaño actual de la base de datos, decenas de megabytes, es del orden de céntimos al mes. El Tech Lead lo confirma con la tarifa de Railway al activarlo, y queda anotado en `docs/despliegue.md`.
- **Activación en dos pasos.**
  - Este ADR, los scripts, la imagen y su prueba automática no tienen coste y se fusionan primero.
  - Los recursos de pago (bucket, servicio programado e instantáneas) se añaden después en `.railway/railway.ts`, con la aprobación del Tech Lead. Al fusionarse se crean en producción.
- **La retención del dato en bruto** (`HISTORY_RAW_RETENTION_DAYS=30`, ADR-0016) se podrá activar cuando la restauración de prueba lleve una semana en verde.
- **Recuperar es un procedimiento manual,** descrito en `docs/despliegue.md`: restaurar el volcado de una fecha en el PostgreSQL de producción, o una instantánea desde Railway.

## Criterios de revisión

- La restauración de prueba tarda más de 15 minutos, o el volcado supera 1 GB: valorar copias incrementales o instantáneas del volumen como vía principal.
- Se necesita perder menos de un día de datos: aumentar la frecuencia o añadir el archivo continuo de WAL.
- Se exige protección ante la pérdida de la cuenta de Railway: copiar los volcados también a un proveedor externo (opción 3).

## Actualización (4 de octubre de 2026): no se activa en la demo

LogicFlows es hoy una demostración con una célula simulada: sus datos no son reales y se pueden regenerar en minutos (LF-77). El Tech Lead decide **no activar las copias en producción** mientras siga siéndolo.

- **Sigue en el repositorio y probado en cada pull request:** la imagen `logicflows-backup`, los scripts de volcado y de restauración de prueba y su prueba con un PostgreSQL y un bucket S3 de prueba.
- **Queda preparado, sin fusionar:** el cambio que crea en producción el bucket `copias`, el servicio programado y el flujo diario de restauración. Está en la rama `feature/LF-82-activar-copias` (pull request #77, cerrada sin fusionar). Su plan de Railway solo crea esos dos recursos.
- **El coste revisado** y el procedimiento de activación están en `docs/despliegue.md`.

**Cuándo activarlas:** en cuanto LogicFlows reciba datos de una planta real, o antes de activar la retención del dato en bruto si esos datos deben poder recuperarse.

