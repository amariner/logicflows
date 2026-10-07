import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import type { DecodedMessage } from '@logicflows/contract';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';

export interface IngestedMessage {
  readonly decoded: DecodedMessage;
  /** Momento en el que la API recibió el mensaje, en ISO 8601 UTC. */
  readonly receivedAt: string;
}

/**
 * Flujo interno de los mensajes aceptados por la ingesta. Lo consumen el
 * tiempo real y la persistencia sin depender de MQTT.
 *
 * Además encadena las escrituras de la persistencia, de una en una y en orden,
 * para que la ingesta pueda esperar a que un mensaje esté guardado antes de
 * confirmarlo al broker (LF-117).
 */
@Injectable()
export class TelemetryStream implements OnModuleDestroy {
  readonly #subject = new Subject<IngestedMessage>();
  #writes: Promise<void> = Promise.resolve();

  get messages$(): Observable<IngestedMessage> {
    return this.#subject.asObservable();
  }

  publish(message: IngestedMessage): void {
    this.#subject.next(message);
  }

  /**
   * Encola una escritura detrás de las anteriores. `work` no debe fallar: si
   * fallara, la cadena seguiría con la siguiente.
   */
  enqueueWrite(work: () => Promise<void>): void {
    this.#writes = this.#writes.then(work).catch(() => undefined);
  }

  /** Se resuelve cuando ha terminado todo lo encolado hasta ahora. */
  written(): Promise<void> {
    return this.#writes;
  }

  onModuleDestroy(): void {
    this.#subject.complete();
  }
}
