import { decodeMessage } from '@logicflows/contract';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
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

const setup = () => {
  const stream = new TelemetryStream();
  const store = new CellStateStore(stream);
  store.onModuleInit();
  const updates: CellSnapshot[] = [];
  store.updates$.subscribe((cell) => updates.push(cell));
  const ingest = (decoded: DecodedMessage) => {
    stream.publish({ decoded, receivedAt: '2026-10-05T08:30:00.000Z' });
  };
  return { store, updates, ingest };
};

describe('información de las células', () => {
  it('está vacía hasta recibir mensajes', () => {
    expect(setup().store.snapshot()).toEqual([]);
  });

  it('combina la conexión, el estado y la telemetría de cada célula', () => {
    const { store, ingest } = setup();
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

  it('conserva solo el último mensaje de cada tipo', () => {
    const { store, ingest } = setup();
    ingest(decode('telemetry', buildTelemetryMessage({ seq: 1, boxesTotal: 1 })));
    ingest(decode('telemetry', buildTelemetryMessage({ seq: 2, boxesTotal: 2 })));
    expect(store.snapshot()[0]?.telemetry?.boxesTotal).toBe(2);
    expect(store.snapshot()[0]?.state).toBeNull();
  });

  it('emite la información actualizada de la célula que cambia', () => {
    const { updates, ingest } = setup();
    ingest(
      decode(
        'state',
        buildStateMessage({ state: 'PAUSED', event: 'pause', previousState: 'RUNNING' }),
      ),
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ cellId: 'cell-01', state: { state: 'PAUSED' } });
  });

  it('separa las células y las ordena', () => {
    const { store, ingest } = setup();
    ingest(decode('state', buildStateMessage({ cellId: 'cell-02' })));
    ingest(decode('state', buildStateMessage({ cellId: 'cell-01' })));
    expect(store.snapshot().map((cell) => cell.cellId)).toEqual(['cell-01', 'cell-02']);
  });
});
