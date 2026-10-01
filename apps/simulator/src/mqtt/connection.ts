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

  const reconnectPeriod = options.reconnectPeriodMs ?? 1_000;

  return {
    async publish(topic: string, payload: string, publishOptions: PublishOptions) {
      await client.publishAsync(topic, payload, publishOptions);
    },
    onConnect(listener: () => void) {
      client.on('connect', listener);
    },
    /**
     * Simula un corte de red: destruye el socket sin desconexión limpia, así
     * que el broker publica el Last Will. El cliente reconecta por su cuenta
     * pasado `durationMs`, como tras una caída real.
     */
    interrupt(durationMs: number) {
      options.logger.warn({ durationMs }, 'Cortando la conexión con el broker');
      client.options.reconnectPeriod = durationMs;
      client.once('connect', () => {
        client.options.reconnectPeriod = reconnectPeriod;
      });
      client.stream.destroy();
    },
    /**
     * Cierra la conexión de forma limpia con un límite de tiempo: si el broker
     * no responde, la cierra a la fuerza para que el proceso pueda terminar.
     */
    async close() {
      const closed = await withTimeout(client.endAsync(), CLOSE_TIMEOUT_MS);
      if (!closed) {
        options.logger.warn({}, 'El broker no respondió al cierre: se fuerza la desconexión');
        await client.endAsync(true);
      }
    },
  };
}

/** Tiempo máximo para un cierre limpio de la conexión. */
const CLOSE_TIMEOUT_MS = 2_000;

/** Espera una promesa como máximo `timeoutMs`. Devuelve si terminó a tiempo. */
export async function withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise.then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
