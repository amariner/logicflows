import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModuleBuilder } from '@nestjs/testing';

import { validateConfig } from '../config/config.ts';
import { TEST_TICKET_SECRET, testIssuer } from './auth.ts';

/**
 * Crea la aplicación completa con la configuración indicada y el emisor de
 * tokens de prueba. Cada aplicación
 * recibe su propia configuración validada: ConfigModule la lee una sola vez
 * al importarse AppModule, y una prueba puede crear varias instancias.
 * `customize` permite sustituir proveedores, como el cliente de FCM.
 */
export async function createApp(
  env: Record<string, string>,
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
  const issuer = await testIssuer();
  Object.assign(process.env, {
    LOG_LEVEL: 'warn',
    AUTH_ISSUER: issuer.url,
    REALTIME_TICKET_SECRET: TEST_TICKET_SECRET,
    ...env,
  });
  const config = validateConfig({ ...process.env });
  const { AppModule } = await import('../app.module.ts');
  const { configureApp } = await import('../setup.ts');
  const moduleRef = await customize(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(config)),
  ).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await configureApp(app);
  await app.init();
  return app;
}
