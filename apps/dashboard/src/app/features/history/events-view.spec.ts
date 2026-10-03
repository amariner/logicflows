import { describe, expect, it } from 'vitest';

import { toEventsView } from './events-view';
import type { CellEventDto } from './history.types';

const event = (values: Partial<CellEventDto>): CellEventDto => ({
  kind: 'state',
  at: '2026-10-05T12:20:00.000Z',
  state: 'RUNNING',
  previousState: 'STARTING',
  event: 'started',
  waitingReason: null,
  alarms: [],
  online: null,
  durationSeconds: 1500,
  ...values,
});
const view = (events: CellEventDto[], truncated = false) =>
  toEventsView({ from: '', to: '', truncated, events }, 'Europe/Madrid');

describe('registro de estados y alarmas', () => {
  it('muestra cada estado con su hora local, su presentación y su duración', () => {
    expect(view([event({})]).items[0]).toMatchObject({
      time: '5 oct, 14:20',
      label: 'Produciendo',
      icon: 'play-sharp',
      tone: 'ok',
      duration: 'durante 25 min',
    });
  });

  it('el estado actual está en curso, y la espera dice su motivo', () => {
    expect(
      view([event({ state: 'WAITING', waitingReason: 'STARVED', durationSeconds: null })]).items[0],
    ).toMatchObject({ label: 'En espera · sin cajas', tone: 'warning', duration: 'en curso' });
  });

  it('ordena las alarmas de más a menos grave', () => {
    const alarm = (code: string, severity: 'LOW' | 'CRITICAL') => ({
      code,
      severity,
      message: code,
      raisedAt: '2026-10-05T12:20:00.000Z',
    });
    const item = view([
      event({ state: 'FAULT', alarms: [alarm('CONV-001', 'LOW'), alarm('SAF-001', 'CRITICAL')] }),
    ]).items[0];
    expect(item?.alarms.map((a) => [a.severityLabel, a.code])).toEqual([
      ['Crítica', 'SAF-001'],
      ['Baja', 'CONV-001'],
    ]);
  });

  it('muestra los cambios de conexión', () => {
    expect(
      view([event({ kind: 'connection', state: null, online: false, durationSeconds: null })])
        .items[0],
    ).toMatchObject({
      label: 'Desconectada',
      icon: 'cloud-offline-sharp',
      tone: 'danger',
      duration: null,
    });
  });

  it('avisa si el periodo tiene más eventos de los que se muestran', () => {
    expect(view([event({})], true).truncatedNote).toBe(
      'Se muestran los 1 eventos más recientes del periodo.',
    );
  });
});
