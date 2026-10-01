import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { validateConfig } from '../config/config.ts';

/**
 * Crea la aplicación completa con la configuración indicada. Cada aplicación
 * recibe su propia configuración validada: ConfigModule la lee una sola vez
 * al importarse AppModule, y una prueba puede crear varias instancias.
 */
export async function createApp(env: Record<string, string>): Promise<INestApplication> {
  Object.assign(process.env, { LOG_LEVEL: 'warn', ...env });
  const config = validateConfig({ ...process.env });
  const { AppModule } = await import('../app.module.ts');
  const { configureApp } = await import('../setup.ts');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue(new ConfigService(config))
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await configureApp(app);
  await app.init();
  return app;
}
