import { Module } from '@nestjs/common';

import { IngestionModule } from '../ingestion/ingestion.module.ts';
import { PersistenceModule } from '../persistence/persistence.module.ts';
import { CellStateStore } from './cell-state.store.ts';
import { RealtimeGateway } from './realtime.gateway.ts';

@Module({
  imports: [IngestionModule, PersistenceModule],
  providers: [CellStateStore, RealtimeGateway],
})
export class RealtimeModule {}
