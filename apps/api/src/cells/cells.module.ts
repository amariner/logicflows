import { Module } from '@nestjs/common';

import { PersistenceModule } from '../persistence/persistence.module.ts';
import { RealtimeModule } from '../realtime/realtime.module.ts';
import { CellController, CellsController } from './cells.controller.ts';

@Module({
  imports: [PersistenceModule, RealtimeModule],
  controllers: [CellsController, CellController],
})
export class CellsModule {}
