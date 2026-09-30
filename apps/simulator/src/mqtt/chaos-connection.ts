import type { BrokerConnection, Logger, PublishOptions } from '../broker.ts';
import type { Random } from '../domain/random.ts';
import { randomDuration } from '../incident-generator.ts';
import type { Interruptible } from '../incident-generator.ts';
import type { NetworkChaos } from '../scenarios.ts';

/**
 * Envuelve una conexión para reproducir una red poco fiable: envía algunos
 * mensajes dos veces y retrasa otros para que lleguen desordenados. Sirve
 * para comprobar que la API aplica las reglas de ADR-0004.
 */
export function withNetworkChaos(
  connection: BrokerConnection & Interruptible,
  chaos: NetworkChaos,
  random: Random,
  logger: Logger,
): BrokerConnection & Interruptible {
  const send = async (topic: string, payload: string, options: PublishOptions) => {
    await connection.publish(topic, payload, options);
    if (random() < chaos.duplicateProbability) {
      logger.debug({ topic }, 'Mensaje duplicado a propósito');
      await connection.publish(topic, payload, options);
    }
  };

  return {
    async publish(topic, payload, options) {
      if (random() < chaos.delayProbability) {
        const delay = randomDuration(chaos.delay, random);
        logger.debug({ topic, delayMs: delay }, 'Mensaje retrasado a propósito');
        setTimeout(() => {
          send(topic, payload, options).catch(() => undefined);
        }, delay);
        return;
      }
      await send(topic, payload, options);
    },
    onConnect(listener) {
      connection.onConnect(listener);
    },
    interrupt(durationMs) {
      connection.interrupt(durationMs);
    },
    close() {
      return connection.close();
    },
  };
}
