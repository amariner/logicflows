import mqtt from 'mqtt';

import type { BrokerConnection, Logger, PublishOptions } from '../broker.ts';
import type { Interruptible } from '../incident-generator.ts';

export interface MqttConnectionOptions {
  readonly url: string;
  readonly username: string;
  readonly password: string;
  readonly clientId: string;
  /** Mensaje que el broker publica si la conexión se pierde (ADR-0004). */
  readonly will: { readonly topic: string; readonly payload: string };
  readonly logger: Logger;
  readonly reconnectPeriodMs?: number;
}

/** Conexión MQTT 5 con reconexión automática. */
export function connectToBroker(options: MqttConnectionOptions): BrokerConnection & Interruptible {
  const client = mqtt.connect(options.url, {
    protocolVersion: 5,
    clientId: options.clientId,
    username: options.username,
    password: options.password,
    clean: true,
    reconnectPeriod: options.reconnectPeriodMs ?? 1_000,
    connectTimeout: 5_000,
    // La telemetría con QoS 0 no se acumula mientras no hay conexión.
    queueQoSZero: false,
    will: { topic: options.will.topic, payload: options.will.payload, qos: 1, retain: true },
  });

  client.on('reconnect', () => {
    options.logger.info({}, 'Reconectando con el broker');
  });
  client.on('offline', () => {
    options.logger.warn({}, 'Conexión con el broker perdida');
  });
  client.on('error', (error) => {
    options.logger.error({ error: error.message }, 'Error de la conexión MQTT');
  });

  return {
    async publish(topic: string, payload: string, publishOptions: PublishOptions) {
      await client.publishAsync(topic, payload, publishOptions);
    },
    onConnect(listener: () => void) {
      client.on('connect', listener);
    },
    /**
     * Corta la conexión de forma abrupta, sin desconexión limpia: el broker
     * publica el Last Will. Tras `durationMs` vuelve a conectar.
     */
    interrupt(durationMs: number) {
      options.logger.warn({ durationMs }, 'Cortando la conexión con el broker');
      client.end(true, () => {
        setTimeout(() => {
          client.reconnect();
        }, durationMs);
      });
    },
    async close() {
      await client.endAsync();
    },
  };
}
