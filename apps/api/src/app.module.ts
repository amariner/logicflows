import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { AlarmsModule } from './alarms/alarms.module.ts';
import { AuthModule } from './auth/auth.module.ts';
import { CalendarModule } from './calendar/calendar.module.ts';
import { CellsModule } from './cells/cells.module.ts';
import { validateConfig } from './config/config.ts';
import { DatabaseModule } from './database/database.module.ts';
import type { AppConfig } from './config/config.ts';
import { HealthModule } from './health/health.module.ts';
import { IngestionModule } from './ingestion/ingestion.module.ts';
import { MetricsModule } from './metrics/metrics.module.ts';
import { PersistenceModule } from './persistence/persistence.module.ts';
import { PushModule } from './push/push.module.ts';
import { RealtimeModule } from './realtime/realtime.module.ts';
import { SecurityModule } from './security/security.module.ts';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateConfig }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          base: { service: 'api' },
          // Railway filtra por nivel solo si es texto: «info», no 30 (ADR-0013).
          formatters: { level: (label) => ({ level: label }) },
          // Las comprobaciones de salud y la recogida de métricas se repiten
          // cada pocos segundos y no aportan al registro.
          autoLogging: {
            ignore: (req) => /^\/(health|metrics)(\/|\?|$)/.test(req.url ?? ''),
          },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
        },
      }),
    }),
    // El límite de peticiones se evalúa antes que la autenticación.
    SecurityModule,
    AlarmsModule,
    AuthModule,
    CalendarModule,
    CellsModule,
    DatabaseModule,
    HealthModule,
    IngestionModule,
    MetricsModule,
    PersistenceModule,
    PushModule,
    RealtimeModule,
  ],
})
export class AppModule {}
