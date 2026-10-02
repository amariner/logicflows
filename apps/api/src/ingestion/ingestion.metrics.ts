import { Injectable } from '@nestjs/common';
import { MESSAGE_KINDS, parseTopic } from '@logicflows/contract';
import type { DecodeFailureReason, DecodedMessage } from '@logicflows/contract';
import { Counter, Histogram } from 'prom-client';

import { METRIC_PREFIX, MetricsService } from '../metrics/metrics.service.ts';
import type { SequenceVerdict } from './sequence-guard.ts';

type DiscardReason = DecodeFailureReason | Extract<SequenceVerdict, { accept: false }>['reason'];

/** Tipo de mensaje según su topic, o `unknown` si está fuera del contrato. */
const kindOf = (topic: string): string => parseTopic(topic)?.kind ?? 'unknown';

/**
 * Métricas de la ingesta MQTT (ADR-0013): mensajes recibidos, descartados por
 * motivo, perdidos según la secuencia y latencia desde que la máquina generó
 * el mensaje hasta que la API lo aceptó.
 */
@Injectable()
export class IngestionMetrics {
  readonly #received: Counter<'kind'>;
  readonly #discarded: Counter<'kind' | 'reason'>;
  readonly #missed: Counter<'kind'>;
  readonly #latency: Histogram<'kind'>;

  constructor(metrics: MetricsService) {
    const registers = [metrics.registry];
    this.#received = new Counter({
      name: `${METRIC_PREFIX}mqtt_messages_received_total`,
      help: 'Mensajes MQTT recibidos por la ingesta, válidos o no.',
      labelNames: ['kind'],
      registers,
    });
    this.#discarded = new Counter({
      name: `${METRIC_PREFIX}mqtt_messages_discarded_total`,
      help: 'Mensajes MQTT descartados, por tipo y motivo (contrato o secuencia).',
      labelNames: ['kind', 'reason'],
      registers,
    });
    this.#missed = new Counter({
      name: `${METRIC_PREFIX}mqtt_messages_missed_total`,
      help: 'Mensajes que no llegaron, deducidos de los huecos en la secuencia.',
      labelNames: ['kind'],
      registers,
    });
    this.#latency = new Histogram({
      name: `${METRIC_PREFIX}ingestion_latency_seconds`,
      help: 'Segundos entre la marca de tiempo del mensaje y su aceptación por la API.',
      labelNames: ['kind'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers,
    });
    // Las series existen desde el arranque, con valor 0: una tasa sobre una
    // serie que aún no existe no se puede calcular ni vigilar.
    for (const kind of MESSAGE_KINDS) {
      this.#received.labels(kind).inc(0);
      this.#missed.labels(kind).inc(0);
    }
  }

  received(topic: string): void {
    this.#received.labels(kindOf(topic)).inc();
  }

  discarded(topic: string, reason: DiscardReason): void {
    this.#discarded.labels(kindOf(topic), reason).inc();
  }

  missed(kind: string, count: number): void {
    this.#missed.labels(kind).inc(count);
  }

  /**
   * Latencia de un mensaje aceptado. Los retenidos no cuentan: su marca de
   * tiempo es la de cuando se publicaron, no la de esta entrega. Si el reloj
   * de la máquina va por delante del de la API, la latencia se queda en 0.
   */
  accepted(decoded: DecodedMessage, receivedAt: Date, retained: boolean): void {
    if (retained) {
      return;
    }
    const generatedAt = Date.parse(decoded.message.timestamp);
    const seconds = Math.max(receivedAt.getTime() - generatedAt, 0) / 1_000;
    this.#latency.labels(decoded.kind).observe(seconds);
  }
}
