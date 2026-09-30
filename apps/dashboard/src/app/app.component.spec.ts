import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { AppComponent } from './app.component';

describe('estructura del visor', () => {
  it('muestra el producto y el acceso a las células en el menú', async () => {
    TestBed.configureTestingModule({
      providers: [provideIonicAngular({ mode: 'md' }), provideRouter([])],
    });
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('ion-list-header')?.textContent).toContain('LogicFlows');
    expect(element.querySelector('ion-item')?.getAttribute('href')).toBe('/cells');
  });
});
