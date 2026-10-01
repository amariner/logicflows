import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

export const API_PASSWORD = 'api-test';
export const SIMULATOR_PASSWORD = 'simulator-test';

const infra = (file: string) =>
  fileURLToPath(new URL(`../../../../infra/mosquitto/${file}`, import.meta.url));

/** Puerto libre del equipo, fijo para que no cambie al reiniciar el broker. */
export const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address !== null) {
          resolve(address.port);
        } else {
          reject(new Error('Sin puerto libre'));
        }
      });
    });
  });

export interface TestBroker {
  readonly container: StartedTestContainer;
  readonly url: string;
  /** Listener de MQTT sobre WebSocket (ADR-0008). */
  readonly webSocketUrl: string;
}

/** Mosquitto con la configuración del repositorio: autenticación y ACL incluidas. */
export async function startBroker(): Promise<TestBroker> {
  const port = await freePort();
  const webSocketPort = await freePort();
  const container = await new GenericContainer('eclipse-mosquitto:2.1.2-alpine')
    .withCopyFilesToContainer([
      { source: infra('mosquitto.conf'), target: '/mosquitto/config/mosquitto.conf' },
      { source: infra('acl'), target: '/mosquitto/config/acl' },
      { source: infra('init.sh'), target: '/mosquitto/init/init.sh' },
    ])
    .withEnvironment({
      MQTT_API_PASSWORD: API_PASSWORD,
      MQTT_SIMULATOR_PASSWORD: SIMULATOR_PASSWORD,
    })
    .withCommand(['/bin/sh', '/mosquitto/init/init.sh'])
    .withExposedPorts({ container: 1883, host: port }, { container: 9001, host: webSocketPort })
    .withWaitStrategy(Wait.forLogMessage(/mosquitto version .* running/))
    .start();
  return {
    container,
    url: `mqtt://127.0.0.1:${String(port)}`,
    webSocketUrl: `ws://127.0.0.1:${String(webSocketPort)}/mqtt`,
  };
}

export async function waitFor(condition: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Tiempo de espera agotado');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Reintenta una comprobación asíncrona hasta que deja de fallar. */
export async function eventually(check: () => Promise<void>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await check();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}
