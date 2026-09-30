import type { DecodedMessage } from '@logicflows/contract';

export type SequenceVerdict =
  | { readonly accept: true; readonly missed: number; readonly newSession: boolean }
  | { readonly accept: false; readonly reason: 'DUPLICATE' | 'OUT_OF_ORDER' | 'STALE_SESSION' };

interface StreamPosition {
  readonly sessionId: string;
  readonly seq: number;
  readonly timestamp: string;
}

/**
 * Aplica las reglas de ADR-0004 sobre duplicados, desorden, pérdidas y
 * reinicios. Guarda la última posición procesada por célula y tipo de
 * mensaje, porque cada tipo lleva su propia secuencia.
 */
export class SequenceGuard {
  readonly #positions = new Map<string, StreamPosition>();

  evaluate(decoded: DecodedMessage): SequenceVerdict {
    if (decoded.kind === 'status') {
      // status no lleva secuencia: siempre refleja la última conexión.
      return { accept: true, missed: 0, newSession: false };
    }

    const { siteId, cellId } = decoded.address;
    const key = `${siteId}/${cellId}/${decoded.kind}`;
    const { sessionId, seq, timestamp } = decoded.message;
    const last = this.#positions.get(key);

    if (last === undefined) {
      this.#positions.set(key, { sessionId, seq, timestamp });
      return { accept: true, missed: 0, newSession: true };
    }

    if (sessionId !== last.sessionId) {
      // Las marcas de tiempo ISO en UTC se ordenan como texto.
      if (timestamp < last.timestamp) {
        return { accept: false, reason: 'STALE_SESSION' };
      }
      this.#positions.set(key, { sessionId, seq, timestamp });
      return { accept: true, missed: 0, newSession: true };
    }

    if (seq === last.seq) {
      return { accept: false, reason: 'DUPLICATE' };
    }
    if (seq < last.seq) {
      return { accept: false, reason: 'OUT_OF_ORDER' };
    }
    this.#positions.set(key, { sessionId, seq, timestamp });
    return { accept: true, missed: seq - last.seq - 1, newSession: false };
  }
}
