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
    ['open', 'En directo', 'ok'],
    ['connecting', 'Conectando…', 'warning'],
    ['closed', 'Sin conexión', 'danger'],
  ] as const)('en %s muestra «%s» y no depende solo del color', async (state, label, tone) => {
    const element = await render(state);
    const status = element.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent.trim()).toBe(label);
    expect(status?.classList.contains(`tone-${tone}`)).toBe(true);
    expect(status?.getAttribute('aria-live')).toBe('polite');
    // En directo, el punto que late es decorativo; los demás llevan icono.
    expect(status?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
