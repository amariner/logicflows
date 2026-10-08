import { Module } from '@nestjs/common';

import { HistoryModule } from '../history/history.module.ts';
import { RealtimeModule } from '../realtime/realtime.module.ts';
import { CellController, CellsController, SiteController } from './cells.controller.ts';

@Module({
  imports: [HistoryModule, RealtimeModule],
  controllers: [CellsController, CellController, SiteController],
})
export class CellsModule {}
