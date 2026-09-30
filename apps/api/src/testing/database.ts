import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

/** PostgreSQL con la misma imagen que el entorno local. */
export async function startDatabase(): Promise<StartedPostgreSqlContainer> {
  return new PostgreSqlContainer('postgres:18.6').start();
}
