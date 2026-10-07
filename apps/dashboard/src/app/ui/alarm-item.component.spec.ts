import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { describe, expect, it } from 'vitest';

import { AlarmItemComponent } from './alarm-item.component';
import type { AlarmPresentation } from './alarm-item.component';
import { SEVERITY_PRESENTATION } from './presentation';

const render = async (alarm: AlarmPresentation) => {
  TestBed.configureTestingModule({ providers: [provideIonicAngular({ mode: 'md' })] });
  const fixture = TestBed.createComponent(AlarmItemComponent);
  fixture.componentRef.setInput('alarm', alarm);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('alarma (LF-103)', () => {
  it.each(Object.values(SEVERITY_PRESENTATION))(
    'severidad «$label»: escrita, con icono y con su tono',
    async ({ label, icon, tone }) => {
      const element = await render({
        code: 'ROB-001',
        message: 'Colisión del robot detectada',
        severityLabel: label,
        icon,
        tone,
        sinceLabel: 'desde las 10:30',
      });
      const alarm = element.querySelector('.alarm');
      expect(alarm?.classList.contains(`tone-${tone}`)).toBe(true);
      expect(alarm?.querySelector('strong')?.textContent).toBe(label);
      expect(alarm?.textContent).toContain('ROB-001');
      expect(alarm?.textContent).toContain('desde las 10:30');
      expect(alarm?.textContent).toContain('Colisión del robot detectada');
      expect(alarm?.querySelector('ion-icon')?.getAttribute('aria-hidden')).toBe('true');
    },
  );

  it('sin hora de activación no deja un separador suelto', async () => {
    const element = await render({
      code: 'CONV-001',
      message: 'Sin cajas en la entrada',
      severityLabel: 'Baja',
      icon: 'information-circle-sharp',
      tone: 'info',
    });
    expect(element.querySelector('.heading')?.textContent.replace(/\s+/g, ' ').trim()).toBe(
      'Baja · CONV-001',
    );
  });
});
