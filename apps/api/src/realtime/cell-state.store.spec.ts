import { decodeMessage } from '@logicflows/contract';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
import type {
  AcknowledgementRepository,
  StoredAcknowledgement,
} from '../persistence/acknowledgement.repository.ts';
import type { TelemetryRepository } from '../persistence/telemetry.repository.ts';
import { CellStateStore } from './cell-state.store.ts';

const decode = (kind: string, message: { cellId?: string }): DecodedMessage => {
  const result = decodeMessage(
    `logicflows/v1/demo/${message.cellId ?? 'cell-01'}/${kind}`,
    JSON.stringify(message),
  );
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result;
};

const setup = async (saved: CellSnapshot[] = [], stored: StoredAcknowledgement[] = []) => {
  const stream = new TelemetryStream();
  const repository = { latestSnapshots: () => Promise.resolve(saved) };
  const acknowledgements = { forActivations: () => Promise.resolve(stored) };
  const store = new CellStateStore(
    stream,
    repository as unknown as TelemetryRepository,
    acknowledgements as unknown as AcknowledgementRepository,
  );
  await store.onModuleInit();
  const updates: CellSnapshot[] = [];
  store.updates$.subscribe((cell) => updates.push(cell));
  const ingest = (decoded: DecodedMessage) => {
    stream.publish({ decoded, receivedAt: '2026-10-05T08:30:00.000Z' });
  };
  return { store, updates, ingest };
};

describe('información de las células', () => {
  it('está vacía hasta recibir mensajes', async () => {
    expect((await setup()).store.snapshot()).toEqual([]);
  });

  it('combina la conexión, el estado y la telemetría de cada célula', async () => {
    const { store, ingest } = await setup();
    ingest(decode('status', buildStatusMessage()));
    ingest(decode('state', buildStateMessage({ state: 'RUNNING' })));
    ingest(decode('telemetry', buildTelemetryMessage({ boxesTotal: 7 })));

    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({
      siteId: 'demo',
      cellId: 'cell-01',
      status: { online: true },
      state: { state: 'RUNNING' },
      telemetry: { boxesTotal: 7 },
    });
  });

  it('conserva solo el último mensaje de cada tipo', async () => {
    const { store, ingest } = await setup();
    ingest(decode('telemetry', buildTelemetryMessage({ seq: 1, boxesTotal: 1 })));
    ingest(decode('telemetry', buildTelemetryMessage({ seq: 2, boxesTotal: 2 })));
    expect(store.snapshot()[0]?.telemetry?.boxesTotal).toBe(2);
    expect(store.snapshot()[0]?.state).toBeNull();
  });

  it('emite la información actualizada de la célula que cambia', async () => {
    const { updates, ingest } = await setup();
    ingest(
      decode(
        'state',
        buildStateMessage({ state: 'PAUSED', event: 'pause', previousState: 'RUNNING' }),
      ),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ cellId: 'cell-01', state: { state: 'PAUSED' } });
  });

  it('separa las células y las ordena', async () => {
    const { store, ingest } = await setup();
    ingest(decode('state', buildStateMessage({ cellId: 'cell-02' })));
    ingest(decode('state', buildStateMessage({ cellId: 'cell-01' })));
    expect(store.snapshot().map((cell) => cell.cellId)).toEqual(['cell-01', 'cell-02']);
  });

  it('recupera al arrancar la información guardada de cada célula', async () => {
    const saved: CellSnapshot = {
      siteId: 'demo',
      cellId: 'cell-09',
      status: null,
      state: buildStateMessage({ cellId: 'cell-09', state: 'FAULT' }),
      telemetry: null,
    };
    const { store } = await setup([saved]);
    expect(store.snapshot()).toEqual([saved]);
  });

  it('no sobrescribe con datos guardados la información más reciente de la ingesta', () => {
    const stream = new TelemetryStream();
    const store = new CellStateStore(
      stream,
      {} as TelemetryRepository,
      {} as AcknowledgementRepository,
    );
    store.apply(decode('state', buildStateMessage({ state: 'RUNNING' })));
    store.seed([{ ...empty(), state: buildStateMessage({ state: 'STOPPED' }) }]);
    expect(store.snapshot()[0]?.state?.state).toBe('RUNNING');
  });
});

describe('reconocimientos de alarmas (ADR-0022)', () => {
  const raisedAt = '2026-10-05T08:00:00.000Z';
  const alarm = { code: 'ROB-001', severity: 'HIGH' as const, message: 'Colisión', raisedAt };
  const acknowledgement = {
    code: 'ROB-001',
    raisedAt,
    acknowledgedBy: 'jefa.planta',
    acknowledgedAt: '2026-10-05T08:02:00.000Z',
  };
  const faulted = () =>
    decode('state', buildStateMessage({ state: 'FAULT', activeAlarms: [alarm] }));

  it('añade el reconocimiento a la célula y lo emite a los visores', async () => {
    const { store, updates, ingest } = await setup();
    ingest(faulted());
    store.acknowledge('demo', 'cell-01', acknowledgement);
    expect(updates.at(-1)?.acknowledgements).toEqual([acknowledgement]);
    expect(store.snapshot()[0]?.acknowledgements).toEqual([acknowledgement]);
    // El mismo otra vez no emite nada.
    const emitted = updates.length;
    store.acknowledge('demo', 'cell-01', acknowledgement);
    expect(updates).toHaveLength(emitted);
  });

  it('al resolverse la alarma, su reconocimiento deja de estar', async () => {
    const { store, ingest } = await setup();
    ingest(faulted());
    store.acknowledge('demo', 'cell-01', acknowledgement);
    ingest(decode('state', buildStateMessage({ state: 'STOPPED', seq: 2, activeAlarms: [] })));
    expect(store.snapshot()[0]?.acknowledgements).toBeUndefined();
  });

  it('al arrancar, recupera los reconocimientos de las alarmas activas guardadas', async () => {
    const saved: CellSnapshot = {
      ...empty(),
      state: buildStateMessage({ state: 'FAULT', activeAlarms: [alarm] }),
    };
    const { store } = await setup(
      [saved],
      [
        {
          siteId: 'demo',
          cellId: 'cell-01',
          code: 'ROB-001',
          raisedAt: new Date(raisedAt),
          acknowledgedAt: new Date('2026-10-05T08:02:00.000Z'),
          acknowledgedBy: 'u-1',
          acknowledgedByName: 'jefa.planta',
        },
      ],
    );
    expect(store.snapshot()[0]?.acknowledgements).toEqual([acknowledgement]);
  });
});

function empty(): CellSnapshot {
  return { siteId: 'demo', cellId: 'cell-01', status: null, state: null, telemetry: null };
}
