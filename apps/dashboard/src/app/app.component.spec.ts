import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { FakeWebSocket } from '../testing/fake-web-socket';
import { testProviders } from '../testing/providers';
import { AppComponent } from './app.component';

describe('estructura del visor', () => {
  it('muestra el producto y el acceso a las células en el menú', async () => {
    TestBed.configureTestingModule({
      providers: [...testProviders(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('ion-list-header')?.textContent).toContain('LogicFlows');
    expect(element.querySelector('ion-item')?.getAttribute('href')).toBe('/cells');
    // El canal de tiempo real se abre al arrancar la aplicación.
    expect(FakeWebSocket.latest().url).toBe('ws://api.test/realtime');
  });
});
