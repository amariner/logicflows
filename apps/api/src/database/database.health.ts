import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import type { Pool } from 'pg';

import { POOL } from './database.module.ts';

/** Indica si PostgreSQL responde. */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @Inject(POOL) private readonly pool: Pool,
  ) {}

  async check(): Promise<HealthIndicatorResult<'database'>> {
    const indicator = this.indicators.check('database');
    try {
      await this.pool.query('select 1');
      return indicator.up();
    } catch {
      return indicator.down({ message: 'Sin conexión con PostgreSQL' });
    }
  }
}
