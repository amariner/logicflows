import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/config.ts';
import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { FCM_CLIENT, HttpFcmClient, disabledFcmClient } from './fcm-client.ts';
import type { FcmClient } from './fcm-client.ts';
import { PushController } from './push.controller.ts';
import { PushRepository } from './push.repository.ts';
import { PushService } from './push.service.ts';

/** Avisos de alarmas en el móvil (ADR-0015). */
@Module({
  imports: [IngestionModule],
  controllers: [PushController],
  providers: [
    PushRepository,
    PushService,
    {
      provide: FCM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): FcmClient => {
        const account = config.get('FCM_SERVICE_ACCOUNT', { infer: true });
        return account === undefined ? disabledFcmClient : new HttpFcmClient(account);
      },
    },
  ],
})
export class PushModule {}
