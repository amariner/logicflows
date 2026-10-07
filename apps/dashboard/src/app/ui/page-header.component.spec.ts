import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { PageHeaderComponent } from './page-header.component';

@Component({
  template: `
    <app-page-header [title]="title" [connection]="connection">
      <button headerStart type="button">Menú</button>
      <p class="below">Aviso</p>
    </app-page-header>
  `,
  imports: [PageHeaderComponent],
})
class HostComponent {
  protected readonly title = 'Células';
  protected readonly connection = 'open';
}

describe('cabecera de página (LF-103)', () => {
  it('pone la navegación a la izquierda, el título, «En directo» y lo demás debajo', async () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
    const fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('ion-buttons[slot="start"] button')?.textContent).toBe('Menú');
    expect(element.querySelector('ion-title')?.textContent).toBe('Células');
    expect(element.querySelector('[role="status"]')?.textContent.trim()).toBe('En directo');
    // Fuera de la barra, pero dentro de la cabecera.
    const below = element.querySelector('ion-header > .below');
    expect(below?.textContent).toBe('Aviso');
  });
});
