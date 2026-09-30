import { describe, expect, it } from 'vitest';

import { SCENARIOS } from './scenarios.ts';
import type { DurationRange, Scenario } from './scenarios.ts';

const validRange = ({ minMs, maxMs }: DurationRange) => minMs > 0 && minMs <= maxMs;

describe('escenarios', () => {
  it('el escenario por defecto no provoca incidencias ni problemas de red', () => {
    expect(SCENARIOS.normal).toMatchObject({ incidents: null, network: null });
  });

  it.each(Object.entries(SCENARIOS) as [string, Scenario][])(
    '%s está documentado y sus parámetros son válidos',
    (_name, scenario) => {
      expect(scenario.description.length).toBeGreaterThan(20);
      if (scenario.incidents !== null) {
        const { supplyDuration, pauseDuration, ...rates } = scenario.incidents;
        expect(Object.values(rates).every((rate) => rate >= 0)).toBe(true);
        expect(validRange(supplyDuration) && validRange(pauseDuration)).toBe(true);
      }
      if (scenario.network !== null) {
        const { duplicateProbability, delayProbability, delay, disconnectDuration } =
          scenario.network;
        for (const probability of [duplicateProbability, delayProbability]) {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
        expect(validRange(delay) && validRange(disconnectDuration)).toBe(true);
      }
    },
  );

  it('red-inestable incluye cortes, duplicados y mensajes desordenados', () => {
    expect(SCENARIOS['red-inestable'].network).toMatchObject({
      disconnectPerHour: expect.any(Number) as number,
    });
    const network = SCENARIOS['red-inestable'].network;
    expect(network.disconnectPerHour).toBeGreaterThan(0);
    expect(network.duplicateProbability).toBeGreaterThan(0);
    expect(network.delayProbability).toBeGreaterThan(0);
  });
});
