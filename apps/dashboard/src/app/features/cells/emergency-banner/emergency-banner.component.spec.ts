import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { buildCellView } from '../../../../testing/cell-view';
import type { CellView } from '../cell-view';
import { EmergencyBannerComponent } from './emergency-banner.component';

const render = async (cells: readonly CellView[]) => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
  const fixture = TestBed.createComponent(EmergencyBannerComponent);
  fixture.componentRef.setInput('cells', cells);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('aviso de parada de emergencia', () => {
  it('no aparece si ninguna célula está en parada de emergencia', async () => {
    const banner = await render([buildCellView()]);
    expect(banner.querySelector('[role="alert"]')).toBeNull();
  });

  it('nombra las células en parada de emergencia y se anuncia', async () => {
    const banner = await render([
      buildCellView(),
      buildCellView({ id: 'demo/cell-03', cellId: 'cell-03', state: 'EMERGENCY_STOP' }),
    ]);
    const alert = banner.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Parada de emergencia');
    expect(alert?.textContent).toContain('cell-03');
    expect(alert?.textContent).not.toContain('cell-01');
  });
});
