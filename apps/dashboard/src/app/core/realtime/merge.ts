import type { AlarmAcknowledgement, CellSnapshot } from '@logicflows/contract';

interface Ordered {
  readonly sessionId: string;
  readonly timestamp: string;
  readonly seq?: number;
}

/**
 * Indica si `candidate` es más reciente que `current`, con las reglas de
 * ADR-0004: en la misma sesión manda la secuencia; entre sesiones, la marca de
 * tiempo (ISO 8601 en UTC, comparable como texto).
 */
export function isNewer(candidate: Ordered, current: Ordered | null): boolean {
  if (current === null) {
    return true;
  }
  if (
    candidate.sessionId === current.sessionId &&
    candidate.seq !== undefined &&
    current.seq !== undefined
  ) {
    return candidate.seq > current.seq;
  }
  return candidate.timestamp > current.timestamp;
}

const newest = <T extends Ordered>(current: T | null, candidate: T | null): T | null =>
  candidate !== null && isNewer(candidate, current) ? candidate : current;

/**
 * Combina dos versiones de la información de una célula conservando, para
 * cada tipo de mensaje, el más reciente. Así un dato antiguo (por ejemplo una
 * respuesta REST que llega tarde) nunca sustituye a uno más nuevo.
 */
export function mergeCell(current: CellSnapshot | undefined, incoming: CellSnapshot): CellSnapshot {
  if (current === undefined) {
    return incoming;
  }
  const state = newest(current.state, incoming.state);
  const { acknowledgements: previous = [], ...rest } = current;
  return {
    ...rest,
    status: newest(current.status, incoming.status),
    state,
    telemetry: newest(current.telemetry, incoming.telemetry),
    ...acknowledgementsFor(state, [...previous, ...(incoming.acknowledgements ?? [])]),
  };
}

/**
 * Los reconocimientos de las alarmas activas en el estado que queda (ADR-0022):
 * un reconocimiento no se pierde por llegar en un mensaje anterior, y el de
 * una alarma resuelta desaparece. Sin ninguno, el campo no está.
 */
function acknowledgementsFor(
  state: CellSnapshot['state'],
  candidates: readonly AlarmAcknowledgement[],
): Pick<CellSnapshot, 'acknowledgements'> {
  const active = new Set(
    (state?.activeAlarms ?? []).map((alarm) => `${alarm.code}@${Date.parse(alarm.raisedAt)}`),
  );
  const kept = new Map<string, AlarmAcknowledgement>();
  for (const acknowledgement of candidates) {
    const key = `${acknowledgement.code}@${Date.parse(acknowledgement.raisedAt)}`;
    if (active.has(key) && !kept.has(key)) {
      kept.set(key, acknowledgement);
    }
  }
  return kept.size === 0 ? {} : { acknowledgements: [...kept.values()] };
}
