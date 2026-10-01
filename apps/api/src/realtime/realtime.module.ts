import { Module } from '@nestjs/common';

import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { PersistenceModule } from '../persistence/persistence.module.ts';
import { CellStateStore } from './cell-state.store.ts';
import { RealtimeTickets } from './realtime-tickets.ts';
import { RealtimeTicketsController } from './realtime-tickets.controller.ts';
import { RealtimeGateway } from './realtime.gateway.ts';

@Module({
  imports: [IngestionModule, PersistenceModule],
  controllers: [RealtimeTicketsController],
  providers: [CellStateStore, RealtimeGateway, RealtimeTickets],
  exports: [CellStateStore],
})
export class RealtimeModule {}
