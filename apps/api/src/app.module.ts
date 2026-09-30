import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';

import { validateConfig } from './config/config.ts';
import type { AppConfig } from './config/config.ts';
import { HealthModule } from './health/health.module.ts';

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
    HealthModule,
  ],
})
export class AppModule {}
