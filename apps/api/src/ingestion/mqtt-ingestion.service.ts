import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeMessage, subscriptionFilter } from '@logicflows/contract';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { AppConfig } from '../config/config.ts';
import { IngestionMetrics } from './ingestion.metrics.ts';
import { SequenceGuard } from './sequence-guard.ts';
import { TelemetryStream } from './telemetry-stream.ts';

/** Caducidad de la sesión persistente en el broker, en segundos (ADR-0004). */
const SESSION_EXPIRY_S = 3_600;

/**
 * Se suscribe a la telemetría de todas las células, valida cada mensaje con
 * el contrato, aplica las reglas de secuencia de ADR-0004 y publica los
 * mensajes aceptados en el flujo interno. Un mensaje inválido se descarta con
 * un aviso sin detener la suscripción.
 */
@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  readonly #guard = new SequenceGuard();
  #client: MqttClient | undefined;

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly stream: TelemetryStream,
    private readonly metrics: IngestionMetrics,
    @InjectPinoLogger(MqttIngestionService.name) private readonly logger: PinoLogger,
  ) {}

  get connected(): boolean {
    return this.#client?.connected ?? false;
  }

  onModuleInit(): void {
    const url = this.config.get('MQTT_URL', { infer: true });
    const clientId = this.config.get('MQTT_CLIENT_ID', { infer: true });
    // La conexión no bloquea el arranque: si el broker no está disponible, la
    // API arranca, informa en /health/ready y se reconecta sola.
    const client = mqtt.connect(url, {
      protocolVersion: 5,
      clientId,
      username: this.config.get('MQTT_API_USERNAME', { infer: true }),
      password: this.config.get('MQTT_API_PASSWORD', { infer: true }),
      clean: false,
      properties: { sessionExpiryInterval: SESSION_EXPIRY_S },
      reconnectPeriod: 1_000,
      connectTimeout: 5_000,
    });

    client.on('connect', (connack) => {
      this.logger.info(
        { broker: url, clientId, sessionPresent: connack.sessionPresent },
        'Conectado al broker',
      );
      client.subscribe(subscriptionFilter(), { qos: 1 }, (error) => {
        if (error) {
          this.logger.error({ error: error.message }, 'No se pudo suscribir a la telemetría');
        }
      });
    });
    client.on('offline', () => {
      this.logger.warn({ broker: url }, 'Conexión con el broker perdida');
    });
    client.on('error', (error) => {
      this.logger.error({ error: error.message }, 'Error de la conexión MQTT');
    });
    client.on('message', (topic, payload, packet) => {
      this.#handle(topic, payload.toString('utf8'), packet.retain);
    });

    this.#client = client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.#client?.endAsync();
  }

  #handle(topic: string, payload: string, retained: boolean): void {
    this.metrics.received(topic);
    const decoded = decodeMessage(topic, payload);
    if (!decoded.ok) {
      this.metrics.discarded(topic, decoded.reason);
      this.logger.warn(
        { topic, reason: decoded.reason, detail: decoded.detail },
        'Mensaje descartado',
      );
      return;
    }

    const verdict = this.#guard.evaluate(decoded);
    if (!verdict.accept) {
      this.metrics.discarded(topic, verdict.reason);
      // Los duplicados de QoS 1 y los retenidos ya procesados son esperables.
      const expected = verdict.reason === 'DUPLICATE' || retained;
      this.logger[expected ? 'debug' : 'warn'](
        { topic, reason: verdict.reason },
        'Mensaje descartado por su secuencia',
      );
      return;
    }
    if (verdict.missed > 0) {
      this.metrics.missed(decoded.kind, verdict.missed);
      // Con QoS 0 las pérdidas de telemetría son esperables; las de estado no.
      this.logger[decoded.kind === 'state' ? 'warn' : 'debug'](
        { topic, missed: verdict.missed },
        'Mensajes perdidos',
      );
    }

    const receivedAt = new Date();
    this.metrics.accepted(decoded, receivedAt, retained);
    this.logger.debug({ topic, kind: decoded.kind }, 'Mensaje aceptado');
    this.stream.publish({ decoded, receivedAt: receivedAt.toISOString() });
  }
}
