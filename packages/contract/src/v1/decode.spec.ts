import { describe, expect, it } from 'vitest';

import { buildStateMessage, buildTelemetryMessage } from '../testing/index.js';
import { decodeMessage } from './decode.js';

const stateTopic = 'logicflows/v1/demo/cell-01/state';

describe('decodeMessage', () => {
  it('devuelve el mensaje validado y su dirección', () => {
    const result = decodeMessage(stateTopic, JSON.stringify(buildStateMessage()));
    expect(result.ok).toBe(true);
    if (result.ok && result.kind === 'state') {
      expect(result.address).toEqual({ siteId: 'demo', cellId: 'cell-01', kind: 'state' });
      expect(result.message.state).toBe('RUNNING');
    }
  });

  it('valida cada mensaje con el esquema de su topic', () => {
    const telemetryOnStateTopic = JSON.stringify(buildTelemetryMessage());
    expect(decodeMessage(stateTopic, telemetryOnStateTopic)).toMatchObject({
      ok: false,
      reason: 'INVALID_SCHEMA',
    });
  });

  it.each([
    ['un topic fuera del contrato', 'logicflows/v2/demo/cell-01/state', '{}', 'INVALID_TOPIC'],
    ['una carga útil que no es JSON', stateTopic, 'RUNNING', 'INVALID_JSON'],
    ['un mensaje incompleto', stateTopic, '{"state":"RUNNING"}', 'INVALID_SCHEMA'],
    [
      'una célula distinta a la del topic',
      'logicflows/v1/demo/cell-02/state',
      JSON.stringify(buildStateMessage()),
      'TOPIC_MISMATCH',
    ],
  ])('rechaza %s', (_case, topic, payload, reason) => {
    const result = decodeMessage(topic, payload);
    expect(result).toMatchObject({ ok: false, reason });
  });

  it('explica el motivo de un error de esquema', () => {
    const result = decodeMessage(stateTopic, JSON.stringify({ ...buildStateMessage(), seq: -1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).toContain('seq');
    }
  });
});
