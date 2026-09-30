import { fileURLToPath } from 'node:url';

import { Global, Inject, Module } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';

import type { AppConfig } from '../config/config.ts';
import * as schema from './schema.ts';

export type Database = NodePgDatabase<typeof schema>;

/** Token de inyección de la base de datos. */
export const DATABASE = Symbol('DATABASE');
const POOL = Symbol('POOL');

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

@Global()
@Module({
  providers: [
    {
      provide: POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        new Pool({ connectionString: config.get('DATABASE_URL', { infer: true }), max: 10 }),
    },
    {
      provide: DATABASE,
      inject: [POOL, PinoLogger],
      // Las migraciones pendientes se aplican antes de que la base de datos
      // esté disponible para el resto de la aplicación (ADR-0007).
      useFactory: async (pool: Pool, logger: PinoLogger): Promise<Database> => {
        const db = drizzle(pool, { schema });
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        logger.info({ context: 'Database' }, 'Migraciones de la base de datos aplicadas');
        return db;
      },
    },
  ],
  exports: [DATABASE, POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

export { POOL };
