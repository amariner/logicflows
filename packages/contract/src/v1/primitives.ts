import { z } from 'zod';

/** Identificador de planta o de célula: minúsculas, dígitos y guiones. */
export const IDENTIFIER_PATTERN = /^[a-z0-9-]{1,32}$/;

export const siteIdSchema = z.string().regex(IDENTIFIER_PATTERN);
export const cellIdSchema = z.string().regex(IDENTIFIER_PATTERN);

/** UUID versión 7 (RFC 9562): ordenable por momento de creación. */
export const uuidV7Schema = z.uuid({ version: 'v7' });

/** Marca de tiempo ISO 8601 en UTC con milisegundos: `2026-10-05T08:30:00.000Z`. */
export const timestampSchema = z.iso.datetime({ precision: 3 });

export const sequenceSchema = z.int().nonnegative();
