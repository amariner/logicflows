import { Injectable } from '@nestjs/common';
import { CELL_STATES } from '@logicflows/contract';
import { Gauge } from 'prom-client';

import { METRIC_PREFIX, MetricsService } from '../metrics/metrics.service.ts';
import { CellStateStore } from './cell-state.store.ts';

/**
 * Métricas de cada célula conocida (ADR-0013), calculadas al recogerlas a
 * partir de la última información de la célula. Como el almacén se recupera
 * de la base de datos al arrancar, una célula que dejó de publicar sigue
 * apareciendo con su última marca de tiempo aunque la API se reinicie, y la
 * alerta no se pierde.
 */
@Injectable()
export class CellMetrics {
  constructor(metrics: MetricsService, store: CellStateStore) {
    const registers = [metrics.registry];
    new Gauge({
      name: `${METRIC_PREFIX}cell_last_message_timestamp_seconds`,
      help: 'Marca de tiempo (época Unix) del último mensaje de la célula.',
      labelNames: ['site_id', 'cell_id'],
      registers,
      collect() {
        this.reset();
        for (const cell of store.snapshot()) {
          const timestamps = [cell.status, cell.state, cell.telemetry]
            .filter((message) => message !== null)
            .map((message) => Date.parse(message.timestamp));
          if (timestamps.length > 0) {
            this.labels(cell.siteId, cell.cellId).set(Math.max(...timestamps) / 1_000);
          }
        }
      },
    });
    new Gauge({
      name: `${METRIC_PREFIX}cell_online`,
      help: 'Conexión de la célula con el broker según su último status (1 conectada, 0 no).',
      labelNames: ['site_id', 'cell_id'],
      registers,
      collect() {
        this.reset();
        for (const cell of store.snapshot()) {
          if (cell.status !== null) {
            this.labels(cell.siteId, cell.cellId).set(cell.status.online ? 1 : 0);
          }
        }
      },
    });
    new Gauge({
      name: `${METRIC_PREFIX}cell_state`,
      help: 'Estado de la célula (ADR-0003): 1 en la serie de su estado actual y 0 en el resto.',
      labelNames: ['site_id', 'cell_id', 'state'],
      registers,
      collect() {
        this.reset();
        for (const cell of store.snapshot()) {
          if (cell.state !== null) {
            for (const state of CELL_STATES) {
              this.labels(cell.siteId, cell.cellId, state).set(state === cell.state.state ? 1 : 0);
            }
          }
        }
      },
    });
    // Contadores acumulados de la máquina (ADR-0004). Son gauges porque la API
    // solo refleja el valor que publica la célula; increase() en el panel
    // interpreta igual un reinicio de contadores.
    const counters = [
      [
        'boxes',
        'Cajas procesadas por la célula según su último mensaje de telemetría.',
        'boxesTotal',
      ],
      [
        'pallets',
        'Pallets completados por la célula según su último mensaje de telemetría.',
        'palletsTotal',
      ],
    ] as const;
    for (const [name, help, field] of counters) {
      new Gauge({
        name: `${METRIC_PREFIX}cell_${name}`,
        help,
        labelNames: ['site_id', 'cell_id'],
        registers,
        collect() {
          this.reset();
          for (const cell of store.snapshot()) {
            if (cell.telemetry !== null) {
              this.labels(cell.siteId, cell.cellId).set(cell.telemetry[field]);
            }
          }
        },
      });
    }
  }
}
