import { Module } from '@nestjs/common';

import { PersistenceModule } from '../persistence/persistence.module.ts';
import { RealtimeModule } from '../realtime/realtime.module.ts';
import { AlarmsController } from './alarms.controller.ts';
import { AlarmsService } from './alarms.service.ts';

/** Reconocimiento de alarmas (ADR-0022). */
@Module({
  imports: [PersistenceModule, RealtimeModule],
  controllers: [AlarmsController],
  providers: [AlarmsService],
})
export class AlarmsModule {}
