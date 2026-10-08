import { describe, expect, it } from 'vitest';

import { loadConfig } from './config.ts';

describe('configuración', () => {
  it('aplica los valores por defecto', () => {
    expect(loadConfig({ MQTT_SIMULATOR_PASSWORD: 'secreto' })).toEqual({
      mqtt: { url: 'mqtt://127.0.0.1:1883', username: 'simulator', password: 'secreto' },
      siteId: 'demo',
      cells: ['cell-01'],
      boxIntervalMs: 4_000,
      startupDurationMs: 3_000,
      cycleVariation: 0.1,
      palletChangeMs: 8_000,
      seed: undefined,
      scenario: 'normal',
      faultRecoveryMs: 20_000,
      emergencyStopRecoveryMs: 30_000,
      restartDelayMs: 5_000,
      layersPerPallet: 5,
      boxesPerLayer: 8,
      logLevel: 'info',
    });
  });

  it('convierte los valores numéricos de las variables de entorno', () => {
    const config = loadConfig({ MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_BOX_INTERVAL_MS: '500' });
    expect(config.boxIntervalMs).toBe(500);
  });

  it('admite MQTT sobre WebSocket con TLS (ADR-0008)', () => {
    const url = 'wss://mqtt.logicflows.example/mqtt';
    expect(loadConfig({ MQTT_SIMULATOR_PASSWORD: 'x', MQTT_URL: url }).mqtt.url).toBe(url);
  });

  it('admite varias células en el mismo proceso (LF-123)', () => {
    const config = loadConfig({
      MQTT_SIMULATOR_PASSWORD: 'x',
      SIMULATOR_CELL_ID: 'cell-09',
      SIMULATOR_CELLS: 'cell-01, cell-02,cell-03',
    });
    expect(config.cells).toEqual(['cell-01', 'cell-02', 'cell-03']);
  });

  it.each([
    ['repetidas', 'cell-01,cell-01'],
    ['con un identificador no válido', 'cell-01,Célula 2'],
    ['vacías', ' '],
  ])('rechaza células %s', (_, cells) => {
    expect(() => loadConfig({ MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_CELLS: cells })).toThrow(
      /Configuración no válida/,
    );
  });

  it('trata las variables vacías como no definidas', () => {
    const config = loadConfig({ MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_SEED: '' });
    expect(config.seed).toBeUndefined();
  });

  it.each([
    ['sin contraseña del broker', {}],
    [
      'con un intervalo no numérico',
      { MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_BOX_INTERVAL_MS: 'rápido' },
    ],
    [
      'con una variación del ciclo excesiva',
      { MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_CYCLE_VARIATION: '0.9' },
    ],
    ['con un escenario desconocido', { MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_SCENARIO: 'caos' }],
    ['con una célula no válida', { MQTT_SIMULATOR_PASSWORD: 'x', SIMULATOR_CELL_ID: 'Célula 1' }],
    [
      'con un protocolo que no es MQTT',
      { MQTT_SIMULATOR_PASSWORD: 'x', MQTT_URL: 'http://broker' },
    ],
  ])('rechaza la configuración %s', (_case, env) => {
    expect(() => loadConfig(env)).toThrow('Configuración no válida');
  });
});
