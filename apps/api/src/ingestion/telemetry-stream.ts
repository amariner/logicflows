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
 */
@Injectable()
export class TelemetryStream implements OnModuleDestroy {
  readonly #subject = new Subject<IngestedMessage>();

  get messages$(): Observable<IngestedMessage> {
    return this.#subject.asObservable();
  }

  publish(message: IngestedMessage): void {
    this.#subject.next(message);
  }

  onModuleDestroy(): void {
    this.#subject.complete();
  }
}
