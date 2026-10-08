import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { calendarError } from './calendar.page';

describe('errores al cambiar el calendario (LF-127)', () => {
  it('muestra los motivos de la validación de la API', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: {
        detail: 'La petición no es válida',
        errors: [
          { field: 'shifts', message: 'Los turnos «Mañana» y «Tarde» se solapan' },
          { field: 'shifts', message: 'Los turnos «Mañana» y «Tarde» se solapan' },
        ],
      },
    });
    expect(calendarError(error)).toBe('Los turnos «Mañana» y «Tarde» se solapan');
  });

  it('muestra el detalle de un conflicto: el pasado no se reescribe', () => {
    const detail = 'La versión debe ser como pronto de mañana (hoy es 2026-10-14 en la planta)';
    expect(calendarError(new HttpErrorResponse({ status: 409, error: { detail } }))).toBe(detail);
  });

  it('sin detalle, un mensaje genérico o de permisos', () => {
    expect(calendarError(new HttpErrorResponse({ status: 403, error: null }))).toBe(
      'Tu usuario no puede cambiar el calendario.',
    );
    expect(calendarError(new Error('red'))).toBe(
      'No se pudo guardar el cambio. Inténtalo de nuevo.',
    );
  });
});
