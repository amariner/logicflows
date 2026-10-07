import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { IndicatorComponent } from './indicator.component';

const render = async (inputs: Record<string, string | null>) => {
  const fixture = TestBed.createComponent(IndicatorComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('indicador (LF-103)', () => {
  it('muestra su nombre y su valor con la unidad, como una lista de definiciones', async () => {
    const element = await render({ label: 'Ritmo', value: '820', unit: 'cajas/h', testId: 'kpi' });
    expect(element.querySelector('dt')?.textContent).toBe('Ritmo');
    const value = element.querySelector('dd');
    expect(value?.textContent.replace(/\s+/g, ' ').trim()).toBe('820 cajas/h');
    expect(value?.getAttribute('data-testid')).toBe('kpi');
  });

  it('sin unidad no deja espacio para ella', async () => {
    const element = await render({ label: 'Palés', value: '—' });
    expect(element.querySelector('.unit')).toBeNull();
    expect(element.querySelector('dd')?.textContent.trim()).toBe('—');
  });
});
