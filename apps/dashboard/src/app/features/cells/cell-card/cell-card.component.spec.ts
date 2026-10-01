import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { buildCellView } from '../../../../testing/cell-view';
import type { CellView } from '../cell-view';
import { CellCardComponent } from './cell-card.component';

const render = async (cell: CellView) => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
  const fixture = TestBed.createComponent(CellCardComponent);
  fixture.componentRef.setInput('cell', cell);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('tarjeta de célula', () => {
  it('muestra el estado con icono y texto, y el contador de cajas', async () => {
    const card = await render(buildCellView());
    const state = card.querySelector('[data-testid="state"]');
    expect(state?.textContent.trim()).toBe('Produciendo');
    expect(state?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(card.querySelector('[data-testid="boxes"]')?.textContent).toBe('42');
    expect(card.querySelector('[data-testid="components"]')?.textContent).toContain('Robot');
  });

  it('en estado normal no destaca la tarjeta', async () => {
    const card = await render(buildCellView());
    expect(card.querySelector('ion-card')?.classList.contains('attention')).toBe(false);
  });

  it('destaca la tarjeta y lista las alarmas cuando requiere atención', async () => {
    const card = await render(
      buildCellView({
        state: 'FAULT',
        stateLabel: 'Fallo',
        stateTone: 'danger',
        attention: true,
        alarms: [
          {
            code: 'ROB-001',
            message: 'Colisión del robot detectada',
            severityLabel: 'Alta',
            icon: 'warning-sharp',
            tone: 'danger',
            sinceLabel: 'desde las 08:30',
          },
        ],
      }),
    );
    const ionCard = card.querySelector('ion-card');
    expect(ionCard?.classList.contains('attention')).toBe(true);
    expect(ionCard?.classList.contains('tone-danger')).toBe(true);
    const alarm = card.querySelector('[data-testid="alarm"]');
    expect(alarm?.textContent).toContain('Alta');
    expect(alarm?.textContent).toContain('ROB-001');
    expect(alarm?.textContent).toContain('Colisión del robot detectada');
    expect(card.querySelector('ul.alarms')?.getAttribute('aria-label')).toBe('Alarmas activas');
  });

  it('avisa de que una célula desconectada muestra su último dato', async () => {
    const card = await render(buildCellView({ online: false }));
    expect(card.textContent).toContain('Célula desconectada');
  });
});
