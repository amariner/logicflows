import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Counter } from 'prom-client';
import { concatMap, filter } from 'rxjs';
import type { Subscription } from 'rxjs';

import { TelemetryStream } from '../ingestion/telemetry-stream.ts';
import type { IngestedMessage } from '../ingestion/telemetry-stream.ts';
import { METRIC_PREFIX, MetricsService } from '../metrics/metrics.service.ts';
import { activationsToNotify, isRecent, notificationFor } from './alarm-activations.ts';
import { FCM_CLIENT } from './fcm-client.ts';
import type { FcmClient, SendResult } from './fcm-client.ts';
import { PushRepository } from './push.repository.ts';

/**
 * Avisa en el móvil de las alarmas graves (ADR-0015). Para cada mensaje
 * `state` aceptado por la ingesta, anota cada activación nueva y la envía a
 * todos los dispositivos registrados. Un fallo se registra y no detiene el
 * flujo; sin la cuenta de servicio de FCM no hace nada.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  #subscription: Subscription | undefined;
  readonly #sent: Counter<'result'>;

  constructor(
    private readonly stream: TelemetryStream,
    private readonly repository: PushRepository,
    @Inject(FCM_CLIENT) private readonly fcm: FcmClient,
    @InjectPinoLogger(PushService.name) private readonly logger: PinoLogger,
    metrics: MetricsService,
  ) {
    this.#sent = new Counter({
      name: `${METRIC_PREFIX}push_notifications_total`,
      help: 'Avisos de alarmas enviados a los móviles, por resultado.',
      labelNames: ['result'],
      registers: [metrics.registry],
    });
  }

  onModuleInit(): void {
    if (!this.fcm.enabled) {
      this.logger.info('Avisos de alarmas desactivados: falta FCM_SERVICE_ACCOUNT');
      return;
    }
    this.#subscription = this.stream.messages$
      .pipe(
        filter((message) => message.decoded.kind === 'state'),
        concatMap((message) => this.#handle(message)),
      )
      .subscribe();
  }

  onModuleDestroy(): void {
    this.#subscription?.unsubscribe();
  }

  async #handle({ decoded }: IngestedMessage): Promise<void> {
    if (decoded.kind !== 'state') {
      return;
    }
    try {
      const now = Date.now();
      const activations = activationsToNotify(decoded.message).filter((activation) =>
        isRecent(activation, now),
      );
      for (const activation of activations) {
        if (await this.repository.markNotified(activation, new Date())) {
          await this.#broadcast(notificationFor(activation), activation.code);
        }
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'No se pudo avisar de una alarma',
      );
    }
  }

  async #broadcast(notification: ReturnType<typeof notificationFor>, code: string): Promise<void> {
    const tokens = await this.repository.deviceTokens();
    const results: SendResult[] = [];
    for (const token of tokens) {
      const result = await this.fcm.send(token, notification);
      this.#sent.labels(result).inc();
      results.push(result);
      if (result === 'unregistered') {
        await this.repository.forgetDevice(token);
      }
    }
    this.logger.info(
      {
        cell: notification.collapseKey,
        code,
        devices: tokens.length,
        failed: results.filter((result) => result === 'failed').length,
      },
      'Aviso de alarma enviado',
    );
  }
}
