import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { buildCellView } from '../../../../testing/cell-view';
import type { CellView } from '../cell-view';
import { CellListComponent } from './cell-list.component';

const render = async (cells: readonly CellView[]) => {
  TestBed.configureTestingModule({
    providers: [provideIonicAngular({ mode: 'md' }), provideRouter([])],
  });
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

  it('muestra una tarjeta por célula', async () => {
    const list = await render([
      buildCellView(),
      buildCellView({ id: 'demo/cell-02', cellId: 'cell-02' }),
    ]);
    expect(list.querySelectorAll('app-cell-card')).toHaveLength(2);
  });
});
