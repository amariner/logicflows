import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { STATE_PRESENTATION } from './presentation';
import { StateBadgeComponent } from './state-badge.component';

describe('etiqueta de estado (LF-103)', () => {
  it.each(Object.entries(STATE_PRESENTATION))(
    '%s combina icono, texto y el tono de su estado',
    async (_state, { label, icon, tone }) => {
      TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
      const fixture = TestBed.createComponent(StateBadgeComponent);
      fixture.componentRef.setInput('label', label);
      fixture.componentRef.setInput('icon', icon);
      fixture.componentRef.setInput('tone', tone);
      await fixture.whenStable();
      const badge = (fixture.nativeElement as HTMLElement).querySelector('.badge');
      expect(badge?.textContent.trim()).toBe(label);
      expect(badge?.classList.contains(`tone-${tone}`)).toBe(true);
      const ionIcon = badge?.querySelector('ion-icon');
      expect(ionIcon?.getAttribute('aria-hidden')).toBe('true');
      expect((ionIcon as (Element & { name?: string }) | null | undefined)?.name).toBe(icon);
    },
  );

  it('tiene un tamaño grande para el estado de la tarjeta', async () => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
    const fixture = TestBed.createComponent(StateBadgeComponent);
    fixture.componentRef.setInput('label', 'Fallo');
    fixture.componentRef.setInput('icon', 'warning-sharp');
    fixture.componentRef.setInput('tone', 'danger');
    fixture.componentRef.setInput('size', 'lg');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.size-lg')).not.toBeNull();
  });
});
