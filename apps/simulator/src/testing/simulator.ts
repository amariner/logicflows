import { decodeMessage } from '@logicflows/contract';
import type { DecodedMessage, MessageByKind } from '@logicflows/contract';
import { testUuid } from '@logicflows/contract/testing';
import { vi } from 'vitest';

import type { BrokerConnection, PublishOptions } from '../broker.ts';
import { MessageFactory } from '../messages.ts';
import { Simulator } from '../simulator.ts';
import type { SimulatorOptions } from '../simulator.ts';

interface Published {
  readonly decoded: DecodedMessage;
  readonly options: PublishOptions;
}

/** Conexión falsa que valida cada mensaje publicado con el contrato. */
export class FakeConnection implements BrokerConnection {
  readonly published: Published[] = [];
  connected = false;
  closed = false;
  readonly #listeners: (() => void)[] = [];

  publish(topic: string, payload: string, options: PublishOptions): Promise<void> {
    if (!this.connected && options.qos === 0) {
      return Promise.reject(new Error('Sin conexión'));
    }
    const decoded = decodeMessage(topic, payload);
    if (!decoded.ok) {
      throw new Error(`Mensaje fuera del contrato: ${decoded.detail}`);
    }
    this.published.push({ decoded, options });
    return Promise.resolve();
  }

  onConnect(listener: () => void): void {
    this.#listeners.push(listener);
  }

  connect(): void {
    this.connected = true;
    for (const listener of this.#listeners) {
      listener();
    }
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  ofKind<K extends DecodedMessage['kind']>(kind: K): MessageByKind[K][] {
    return this.published
      .filter((p) => p.decoded.kind === kind)
      .map((p) => p.decoded.message as MessageByKind[K]);
  }

  optionsOf(kind: DecodedMessage['kind']): PublishOptions[] {
    return this.published.filter((p) => p.decoded.kind === kind).map((p) => p.options);
  }
}

export const silentLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

export const TEST_OPTIONS: SimulatorOptions = {
  format: { layersPerPallet: 2, boxesPerLayer: 2 },
  boxIntervalMs: 1_000,
  cycleVariation: 0.1,
  palletChangeMs: 5_000,
  startupDurationMs: 2_000,
  faultRecoveryMs: 10_000,
  emergencyStopRecoveryMs: 15_000,
  restartDelayMs: 3_000,
  heartbeatMs: 10_000,
};

/** Simulador con conexión falsa. La fuente aleatoria centrada anula la variación del ciclo. */
export function createTestSimulator(
  options: Partial<SimulatorOptions> = {},
  random: () => number = () => 0.5,
) {
  let id = 0;
  const connection = new FakeConnection();
  const messages = new MessageFactory({
    siteId: 'demo',
    cellId: 'cell-01',
    sessionId: testUuid(1),
    newId: () => testUuid(100 + id++),
  });
  const simulator = new Simulator(
    { ...TEST_OPTIONS, ...options },
    { connection, messages, logger: silentLogger, random },
  );
  return { connection, simulator };
}
