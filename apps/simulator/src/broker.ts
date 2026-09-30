/** Opciones de publicación de ADR-0004. */
export interface PublishOptions {
  readonly qos: 0 | 1;
  readonly retain: boolean;
}

/** Conexión con el broker que necesita el simulador. */
export interface BrokerConnection {
  publish(topic: string, payload: string, options: PublishOptions): Promise<void>;
  /** Registra una función que se ejecuta en cada conexión y reconexión. */
  onConnect(listener: () => void): void;
  close(): Promise<void>;
}

/** Registro mínimo que usa el simulador; compatible con pino. */
export interface Logger {
  debug(context: object, message: string): void;
  info(context: object, message: string): void;
  warn(context: object, message: string): void;
  error(context: object, message: string): void;
}
