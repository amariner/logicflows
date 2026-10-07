import { TestBed } from '@angular/core/testing';
import { buildTelemetryMessage } from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { toSchematic } from '../schematic';
import { CellSchematicComponent } from './cell-schematic.component';

const render = async (robot: 'MOVING' | 'FAULT') => {
  const fixture = TestBed.createComponent(CellSchematicComponent);
  fixture.componentRef.setInput(
    'schematic',
    toSchematic(
      buildTelemetryMessage({
        pallet: { currentLayer: 3, layersPerPallet: 5, boxesInLayer: 4, boxesPerLayer: 8 },
        robot: { state: robot },
      }),
    ),
  );
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('dibujo del esquema de la célula (LF-106)', () => {
  it('dibuja el palé capa a capa: dos terminadas, la tercera a medias y dos por hacer', async () => {
    const element = await render('MOVING');
    expect(element.querySelectorAll('.layer.pending')).toHaveLength(3);
    // Dos capas terminadas y el relleno de la que está en curso.
    const done = element.querySelectorAll('.layer.done');
    expect(done).toHaveLength(3);
    expect(done[2]?.getAttribute('width')).toBe('38');
  });

  it('el dibujo es decorativo y el texto dice lo mismo', async () => {
    const element = await render('FAULT');
    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const items = [...element.querySelectorAll('figcaption li')].map((li) =>
      li.textContent.replace(/\s+/g, ' ').trim(),
    );
    expect(items).toEqual(['Cinta en marcha', 'Robot averiado', 'Palé capa 3 de 5, 4 de 8 cajas']);
    expect(element.querySelector('figcaption li.tone-danger')?.textContent).toContain('Robot');
  });
});
