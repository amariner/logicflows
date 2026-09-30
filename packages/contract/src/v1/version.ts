/**
 * Versión del esquema que emiten los publicadores. Todas las versiones de la
 * versión mayor 1 son compatibles: los consumidores aceptan cualquier
 * `schemaVersion` ≥ 1 e ignoran los campos que no conocen (ADR-0004).
 *
 * Vive en su propio módulo, sin dependencias, para que quien solo necesita la
 * constante (como los constructores de pruebas) no cargue Zod.
 */
export const CURRENT_SCHEMA_VERSION = 1;
