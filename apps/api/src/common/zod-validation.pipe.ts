import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { ValidationProblem } from './problem-details.ts';

/** Valida y transforma un parámetro de la petición con un esquema Zod. */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationProblem(
        result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(petición)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
