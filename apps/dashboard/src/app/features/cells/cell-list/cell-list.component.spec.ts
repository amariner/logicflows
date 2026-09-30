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
  palletsTotal: 1,
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
    const page = await render([]);
    expect(page.textContent).toContain('Todavía no hay datos de ninguna célula.');
  });

  it('muestra el estado y las cajas de cada célula', async () => {
    const page = await render([cell]);
    expect(page.textContent).toContain('cell-01');
    expect(page.textContent).toContain('Produciendo');
    expect(page.textContent).toContain('42 cajas');
  });
});
