import { hostname } from 'node:os';

import { decodeMessage } from '@logicflows/contract';
import type { CellSnapshot, DecodedMessage } from '@logicflows/contract';
import {
  buildStateMessage,
  buildStatusMessage,
  buildTelemetryMessage,
} from '@logicflows/contract/testing';
import { describe, expect, it } from 'vitest';

import { IngestionMetrics } from '../ingestion/ingestion.metrics.ts';
import { CellMetrics } from '../realtime/cell.metrics.ts';
import type { CellStateStore } from '../realtime/cell-state.store.ts';
import { MetricsService } from './metrics.service.ts';

const topic = (kind: string) => `logicflows/v1/demo/cell-01/${kind}`;

const decode = (kind: string, message: object): DecodedMessage => {
  const result = decodeMessage(topic(kind), JSON.stringify(message));
  if (!result.ok) {
    throw new Error(result.detail);
  }
  return result;
};

/**
 * Valor de la serie con ese nombre y esas etiquetas, además de las que añade
 * el registro a todas. prom-client no ordena las etiquetas igual en todos los
 * tipos de métrica, así que se comparan como conjunto.
 */
const valueOf = async (
  metrics: MetricsService,
  name: string,
  labels: Record<string, string> = {},
): Promise<number | undefined> => {
  const expected = { ...labels, service: 'api', replica: hostname() };
  const text = await metrics.registry.getSingleMetricAsString(
    name.replace(/_(bucket|sum|count)$/, ''),
  );
  for (const line of text.split('\n')) {
    const match = /^(\w+)\{(.*)\} (\S+)$/.exec(line);
    if (match?.[1] !== name) {
      continue;
    }
    const found = new Map(
      [...(match[2] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map(([, key = '', value = '']) => [
        key,
        value,
      ]),
    );
    if (
      found.size === Object.keys(expected).length &&
      Object.entries(expected).every(([key, value]) => found.get(key) === value)
    ) {
      return Number(match[3]);
    }
  }
  return undefined;
};

describe('métricas de la API', () => {
  it('incluye las métricas estándar de Node.js', async () => {
    const text = await new MetricsService().registry.metrics();
    expect(text).toContain('process_cpu_seconds_total');
    expect(text).toContain('nodejs_eventloop_lag_seconds');
  });

  describe('ingesta', () => {
    const setup = () => {
      const metrics = new MetricsService();
      return { metrics, ingestion: new IngestionMetrics(metrics) };
    };

    it('cuenta desde cero cada tipo de mensaje antes de recibir ninguno', async () => {
      const { metrics } = setup();
      for (const kind of ['status', 'state', 'telemetry']) {
        expect(await valueOf(metrics, 'logicflows_mqtt_messages_received_total', { kind })).toBe(0);
      }
    });

    it('cuenta los recibidos y los descartados por tipo y motivo', async () => {
      const { metrics, ingestion } = setup();
      ingestion.received(topic('state'));
      ingestion.received('otro/topic');
      ingestion.discarded(topic('state'), 'DUPLICATE');
      ingestion.discarded('otro/topic', 'INVALID_TOPIC');

      expect(
        await valueOf(metrics, 'logicflows_mqtt_messages_received_total', { kind: 'state' }),
      ).toBe(1);
      expect(
        await valueOf(metrics, 'logicflows_mqtt_messages_received_total', { kind: 'unknown' }),
      ).toBe(1);
      expect(
        await valueOf(metrics, 'logicflows_mqtt_messages_discarded_total', {
          kind: 'state',
          reason: 'DUPLICATE',
        }),
      ).toBe(1);
      expect(
        await valueOf(metrics, 'logicflows_mqtt_messages_discarded_total', {
          kind: 'unknown',
          reason: 'INVALID_TOPIC',
        }),
      ).toBe(1);
    });

    it('suma los mensajes perdidos', async () => {
      const { metrics, ingestion } = setup();
      ingestion.missed('telemetry', 3);
      expect(
        await valueOf(metrics, 'logicflows_mqtt_messages_missed_total', { kind: 'telemetry' }),
      ).toBe(3);
    });

    it('mide la latencia desde la marca de tiempo del mensaje', async () => {
      const { metrics, ingestion } = setup();
      const message = buildTelemetryMessage({ timestamp: '2026-10-05T08:30:00.000Z' });
      ingestion.accepted(decode('telemetry', message), new Date('2026-10-05T08:30:00.040Z'), false);

      const series = (suffix: string, le?: string) =>
        valueOf(metrics, `logicflows_ingestion_latency_seconds_${suffix}`, {
          kind: 'telemetry',
          ...(le === undefined ? {} : { le }),
        });
      expect(await series('sum')).toBeCloseTo(0.04);
      expect(await series('bucket', '0.05')).toBe(1);
      expect(await series('bucket', '0.025')).toBe(0);
    });

    it('no mide los retenidos y no admite latencias negativas', async () => {
      const { metrics, ingestion } = setup();
      const message = decode('state', buildStateMessage({ timestamp: '2026-10-05T08:30:00.000Z' }));
      ingestion.accepted(message, new Date('2026-10-05T09:00:00.000Z'), true);
      ingestion.accepted(message, new Date('2026-10-05T08:29:59.000Z'), false);

      const series = (suffix: string) =>
        valueOf(metrics, `logicflows_ingestion_latency_seconds_${suffix}`, { kind: 'state' });
      expect(await series('count')).toBe(1);
      expect(await series('sum')).toBe(0);
    });
  });

  describe('células', () => {
    const setup = (cells: CellSnapshot[]) => {
      const metrics = new MetricsService();
      const store = { snapshot: () => cells } as unknown as CellStateStore;
      new CellMetrics(metrics, store);
      return metrics;
    };
    const cell = (overrides: Partial<CellSnapshot>): CellSnapshot => ({
      siteId: 'demo',
      cellId: 'cell-01',
      status: null,
      state: null,
      telemetry: null,
      ...overrides,
    });
    const cellLabels = { site_id: 'demo', cell_id: 'cell-01' };

    it('publica la marca de tiempo del mensaje más reciente de cada célula', async () => {
      const metrics = setup([
        cell({
          status: buildStatusMessage({ timestamp: '2026-10-05T08:00:00.000Z' }),
          telemetry: buildTelemetryMessage({ timestamp: '2026-10-05T08:30:00.000Z' }),
          state: buildStateMessage({ timestamp: '2026-10-05T08:10:00.000Z' }),
        }),
      ]);
      expect(
        await valueOf(metrics, 'logicflows_cell_last_message_timestamp_seconds', cellLabels),
      ).toBe(Date.parse('2026-10-05T08:30:00.000Z') / 1_000);
    });

    it('indica si la célula está conectada según su último status', async () => {
      const metrics = setup([cell({ status: buildStatusMessage({ online: false }) })]);
      expect(await valueOf(metrics, 'logicflows_cell_online', cellLabels)).toBe(0);
    });

    it('marca el estado actual de la célula y sus contadores de producción', async () => {
      const metrics = setup([
        cell({
          state: buildStateMessage({ state: 'RUNNING' }),
          telemetry: buildTelemetryMessage({ boxesTotal: 42, palletsTotal: 3 }),
        }),
      ]);
      expect(
        await valueOf(metrics, 'logicflows_cell_state', { ...cellLabels, state: 'RUNNING' }),
      ).toBe(1);
      expect(
        await valueOf(metrics, 'logicflows_cell_state', { ...cellLabels, state: 'FAULT' }),
      ).toBe(0);
      expect(await valueOf(metrics, 'logicflows_cell_boxes', cellLabels)).toBe(42);
      expect(await valueOf(metrics, 'logicflows_cell_pallets', cellLabels)).toBe(3);
    });

    it('omite la conexión de una célula sin status', async () => {
      const metrics = setup([cell({ telemetry: buildTelemetryMessage() })]);
      expect(await valueOf(metrics, 'logicflows_cell_online', cellLabels)).toBeUndefined();
    });
  });
});
