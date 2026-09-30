import { z } from 'zod';

import { messageSchemas } from './messages.ts';
import type { MessageByKind } from './messages.ts';
import { parseTopic } from './topics.ts';
import type { MessageKind, TopicAddress } from './topics.ts';

export type DecodeFailureReason =
  /** El topic no pertenece a la versión 1 del contrato. */
  | 'INVALID_TOPIC'
  /** La carga útil no es JSON. */
  | 'INVALID_JSON'
  /** El mensaje no cumple el esquema de su tipo. */
  | 'INVALID_SCHEMA'
  /** La planta o la célula del mensaje no coinciden con las del topic. */
  | 'TOPIC_MISMATCH';

export type DecodedMessage = {
  [K in MessageKind]: {
    readonly ok: true;
    readonly kind: K;
    readonly address: TopicAddress;
    readonly message: MessageByKind[K];
  };
}[MessageKind];

export interface DecodeFailure {
  readonly ok: false;
  readonly reason: DecodeFailureReason;
  readonly detail: string;
}

export type DecodeResult = DecodedMessage | DecodeFailure;

const failure = (reason: DecodeFailureReason, detail: string): DecodeFailure => ({
  ok: false,
  reason,
  detail,
});

/**
 * Interpreta un mensaje recibido del broker: comprueba el topic, analiza el
 * JSON, lo valida contra el esquema de su tipo y verifica que la planta y la
 * célula coinciden con las del topic. Nunca lanza excepciones.
 */
export function decodeMessage(topic: string, payload: string): DecodeResult {
  const address = parseTopic(topic);
  if (address === null) {
    return failure('INVALID_TOPIC', `Topic fuera del contrato: ${topic}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(payload);
  } catch {
    return failure('INVALID_JSON', 'La carga útil no es JSON válido');
  }

  const result = messageSchemas[address.kind].safeParse(json);
  if (!result.success) {
    return failure('INVALID_SCHEMA', z.prettifyError(result.error));
  }

  const message = result.data;
  if (message.siteId !== address.siteId || message.cellId !== address.cellId) {
    return failure(
      'TOPIC_MISMATCH',
      `El mensaje es de ${message.siteId}/${message.cellId} y el topic de ${address.siteId}/${address.cellId}`,
    );
  }

  return { ok: true, kind: address.kind, address, message } as DecodedMessage;
}
