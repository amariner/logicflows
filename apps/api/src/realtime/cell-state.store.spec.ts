import { decodeMessage } from '@logicflows/contract';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
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

const setup = async (saved: CellSnapshot[] = []) => {
  const stream = new TelemetryStream();
  const repository = { latestSnapshots: () => Promise.resolve(saved) };
  const store = new CellStateStore(stream, repository as unknown as TelemetryRepository);
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
    const store = new CellStateStore(stream, {} as TelemetryRepository);
    store.apply(decode('state', buildStateMessage({ state: 'RUNNING' })));
    store.seed([{ ...empty(), state: buildStateMessage({ state: 'STOPPED' }) }]);
    expect(store.snapshot()[0]?.state?.state).toBe('RUNNING');
  });
});

function empty(): CellSnapshot {
  return { siteId: 'demo', cellId: 'cell-01', status: null, state: null, telemetry: null };
}
