import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { buildCellView } from '../../../../testing/cell-view';
import { ProductionIndicatorsComponent } from './production-indicators.component';

const render = async (stale = false) => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
  const fixture = TestBed.createComponent(ProductionIndicatorsComponent);
  fixture.componentRef.setInput('indicators', buildCellView().indicators);
  fixture.componentRef.setInput('stale', stale);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

const text = (element: HTMLElement, id: string) =>
  element.querySelector(`[data-testid="${id}"]`)?.textContent.replace(/\s+/g, ' ').trim();

describe('indicadores de producción', () => {
  it('muestra cada indicador con su etiqueta y su unidad', async () => {
    const element = await render();
    expect(text(element, 'boxes')).toBe('42');
    expect(text(element, 'pallets')).toBe('1');
    expect(text(element, 'layer')).toBe('2 de 5');
    expect(text(element, 'throughput')).toBe('820 cajas/h');
    expect(text(element, 'cycle-time')).toBe('4,2 s');
    expect([...element.querySelectorAll('dt')].map((dt) => dt.textContent.trim())).toEqual([
      'Palés',
      'Capa',
      'Ritmo',
      'Ciclo',
    ]);
  });

  it('describe el avance del palé a los lectores de pantalla', async () => {
    const element = await render();
    const bar = element.querySelector('[data-testid="pallet-progress"]');
    expect(bar?.getAttribute('aria-label')).toBe('Palé en curso: 10 de 40 cajas');
  });

  it('atenúa los valores de una célula desconectada', async () => {
    const element = await render(true);
    expect(element.querySelector('.indicators')?.classList.contains('stale')).toBe(true);
  });
});
