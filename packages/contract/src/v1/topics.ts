import { IDENTIFIER_PATTERN } from './primitives.ts';

/** Prefijo de todos los topics de la versión mayor 1 del contrato. */
export const TOPIC_PREFIX = 'logicflows/v1';

export const MESSAGE_KINDS = ['status', 'state', 'telemetry'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export interface TopicAddress {
  readonly siteId: string;
  readonly cellId: string;
  readonly kind: MessageKind;
}

export function isMessageKind(value: string): value is MessageKind {
  return (MESSAGE_KINDS as readonly string[]).includes(value);
}

/** Construye el topic de un mensaje: `logicflows/v1/{siteId}/{cellId}/{kind}`. */
export function buildTopic({ siteId, cellId, kind }: TopicAddress): string {
  if (!IDENTIFIER_PATTERN.test(siteId)) {
    throw new RangeError(`Identificador de planta no válido: "${siteId}"`);
  }
  if (!IDENTIFIER_PATTERN.test(cellId)) {
    throw new RangeError(`Identificador de célula no válido: "${cellId}"`);
  }
  return `${TOPIC_PREFIX}/${siteId}/${cellId}/${kind}`;
}

/** Interpreta un topic del contrato. Devuelve `null` si no pertenece a la versión 1. */
export function parseTopic(topic: string): TopicAddress | null {
  const segments = topic.split('/');
  if (segments.length !== 5) {
    return null;
  }
  const [root, version, siteId, cellId, kind] = segments;
  if (`${root ?? ''}/${version ?? ''}` !== TOPIC_PREFIX) {
    return null;
  }
  if (siteId === undefined || !IDENTIFIER_PATTERN.test(siteId)) {
    return null;
  }
  if (cellId === undefined || !IDENTIFIER_PATTERN.test(cellId)) {
    return null;
  }
  if (kind === undefined || !isMessageKind(kind)) {
    return null;
  }
  return { siteId, cellId, kind };
}

/** Filtro de suscripción para un tipo de mensaje de todas las plantas y células. */
export function subscriptionFilter(kind?: MessageKind): string {
  return `${TOPIC_PREFIX}/+/+/${kind ?? '+'}`;
}
