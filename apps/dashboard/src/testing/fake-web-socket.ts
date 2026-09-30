import type { RealtimeMessage } from '@logicflows/contract';

/** WebSocket falso para las pruebas: la prueba decide cuándo abre, recibe o cierra. */
export class FakeWebSocket extends EventTarget {
  static readonly instances: FakeWebSocket[] = [];
  closed = false;

  constructor(readonly url: string) {
    super();
    FakeWebSocket.instances.push(this);
  }

  static reset(): void {
    FakeWebSocket.instances.length = 0;
  }

  static latest(): FakeWebSocket {
    const socket = FakeWebSocket.instances.at(-1);
    if (socket === undefined) {
      throw new Error('No se ha creado ningún WebSocket');
    }
    return socket;
  }

  open(): void {
    this.dispatchEvent(new Event('open'));
  }

  receive(message: RealtimeMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) }));
  }

  drop(): void {
    this.dispatchEvent(new Event('close'));
  }

  close(): void {
    this.closed = true;
  }
}
