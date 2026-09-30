import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

/**
 * Crea la aplicación completa con la configuración indicada. AppModule se
 * importa después de fijar las variables de entorno, porque ConfigModule las
 * valida al cargarse.
 */
export async function createApp(env: Record<string, string>): Promise<INestApplication> {
  Object.assign(process.env, { LOG_LEVEL: 'warn', ...env });
  const { AppModule } = await import('../app.module.ts');
  const { configureApp } = await import('../setup.ts');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await configureApp(app);
  await app.init();
  return app;
}
