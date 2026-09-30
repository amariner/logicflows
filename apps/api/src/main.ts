import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.ts';
import type { AppConfig } from './config/config.ts';
import { setupOpenApi } from './openapi.ts';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
app.useWebSocketAdapter(new WsAdapter(app));
app.enableShutdownHooks();
setupOpenApi(app);

const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
await app.listen(config.get('API_PORT', { infer: true }));
