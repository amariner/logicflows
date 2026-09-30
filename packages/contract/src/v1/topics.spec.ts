import { describe, expect, it } from 'vitest';

import { buildTopic, parseTopic, subscriptionFilter } from './topics.js';

describe('topics', () => {
  it('construye el topic de un mensaje', () => {
    expect(buildTopic({ siteId: 'demo', cellId: 'cell-01', kind: 'state' })).toBe(
      'logicflows/v1/demo/cell-01/state',
    );
  });

  it('interpreta un topic válido', () => {
    expect(parseTopic('logicflows/v1/demo/cell-01/telemetry')).toEqual({
      siteId: 'demo',
      cellId: 'cell-01',
      kind: 'telemetry',
    });
  });

  it.each([
    ['otra versión mayor', 'logicflows/v2/demo/cell-01/state'],
    ['otro prefijo', 'factory/v1/demo/cell-01/state'],
    ['un nivel de menos', 'logicflows/v1/demo/state'],
    ['un nivel de más', 'logicflows/v1/demo/cell-01/state/extra'],
    ['un tipo desconocido', 'logicflows/v1/demo/cell-01/alarms'],
    ['mayúsculas en la célula', 'logicflows/v1/demo/Cell-01/state'],
    ['una planta vacía', 'logicflows/v1//cell-01/state'],
    ['un identificador demasiado largo', `logicflows/v1/${'a'.repeat(33)}/cell-01/state`],
  ])('rechaza un topic con %s', (_case, topic) => {
    expect(parseTopic(topic)).toBeNull();
  });

  it('rechaza construir un topic con identificadores no válidos', () => {
    expect(() => buildTopic({ siteId: 'Demo', cellId: 'cell-01', kind: 'state' })).toThrow(
      RangeError,
    );
    expect(() => buildTopic({ siteId: 'demo', cellId: 'cell 01', kind: 'state' })).toThrow(
      RangeError,
    );
  });

  it('genera filtros de suscripción para un tipo o para todos', () => {
    expect(subscriptionFilter('state')).toBe('logicflows/v1/+/+/state');
    expect(subscriptionFilter()).toBe('logicflows/v1/+/+/+');
  });
});
