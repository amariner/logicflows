import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import type { CellView } from '../cell-view';
import { CellListComponent } from './cell-list.component';

const cell: CellView = {
  id: 'demo/cell-01',
  siteId: 'demo',
  cellId: 'cell-01',
  online: true,
  state: 'RUNNING',
  stateLabel: 'Produciendo',
  boxesTotal: 42,
  boxesLabel: '42',
  palletsTotal: 1,
  palletLabel: '1 pallet · capa 2 de 5',
};

const render = async (cells: readonly CellView[]) => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
  const fixture = TestBed.createComponent(CellListComponent);
  fixture.componentRef.setInput('cells', cells);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('lista de células', () => {
  it('indica que todavía no hay datos', async () => {
    const list = await render([]);
    expect(list.textContent).toContain('Todavía no hay datos de ninguna célula.');
  });

  it('destaca el contador de cajas de cada célula', async () => {
    const list = await render([cell]);
    expect(list.querySelector('[data-testid="boxes"]')?.textContent).toBe('42');
    expect(list.textContent).toContain('Produciendo');
    expect(list.textContent).toContain('1 pallet · capa 2 de 5');
  });

  it('avisa de que una célula desconectada muestra su último dato', async () => {
    const list = await render([{ ...cell, online: false }]);
    expect(list.textContent).toContain('Célula desconectada');
  });
});
