import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { CellsModule } from './cells/cells.module.ts';
import { validateConfig } from './config/config.ts';
import { DatabaseModule } from './database/database.module.ts';
import type { AppConfig } from './config/config.ts';
import { HealthModule } from './health/health.module.ts';
import { IngestionModule } from './ingestion/ingestion.module.ts';
import { PersistenceModule } from './persistence/persistence.module.ts';
import { RealtimeModule } from './realtime/realtime.module.ts';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateConfig }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          base: { service: 'api' },
          // Las comprobaciones de salud se repiten cada pocos segundos y no aportan al registro.
          autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    CellsModule,
    DatabaseModule,
    HealthModule,
    IngestionModule,
    PersistenceModule,
    RealtimeModule,
  ],
})
export class AppModule {}
