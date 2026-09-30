import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import type { ConnectionState } from '../realtime/realtime.service';
import { ConnectionStatusComponent } from './connection-status.component';

const render = async (state: ConnectionState) => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
  const fixture = TestBed.createComponent(ConnectionStatusComponent);
  fixture.componentRef.setInput('state', state);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('indicador de conexión', () => {
  it.each([
    ['open', 'En directo', 'success'],
    ['connecting', 'Conectando…', 'warning'],
    ['closed', 'Sin conexión', 'danger'],
  ] as const)('en %s muestra «%s» y no depende solo del color', async (state, label, color) => {
    const element = await render(state);
    const chip = element.querySelector<HTMLElement & { color?: string }>('ion-chip');
    expect(chip?.textContent.trim()).toBe(label);
    expect(chip?.color).toBe(color);
    expect(chip?.getAttribute('role')).toBe('status');
  });
});
