import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { describe, expect, it } from 'vitest';

import { testProviders } from '../testing/providers';
import { routes } from './app.routes';

describe('rutas del visor', () => {
  it('la raíz lleva a la página de células, que se muestra sin datos', async () => {
    TestBed.configureTestingModule({
      providers: [...testProviders(), provideRouter(routes)],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(harness.routeNativeElement?.textContent).toContain(
      'Todavía no hay datos de ninguna célula.',
    );
  });
});
