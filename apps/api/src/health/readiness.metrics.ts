import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';

import { DatabaseHealthIndicator } from '../database/database.health.ts';
import { MqttHealthIndicator } from '../ingestion/mqtt.health.ts';
import { METRIC_PREFIX, MetricsService } from '../metrics/metrics.service.ts';

/**
 * Las mismas comprobaciones que `/health/ready`, como métrica (ADR-0013): la
 * alerta «la API no está sana» distingue así entre una API que no responde
 * (`up` a 0) y una que responde pero ha perdido el broker o PostgreSQL.
 */
@Injectable()
export class ReadinessMetrics {
  constructor(
    metrics: MetricsService,
    mqtt: MqttHealthIndicator,
    database: DatabaseHealthIndicator,
  ) {
    new Gauge({
      name: `${METRIC_PREFIX}dependency_up`,
      help: 'Disponibilidad de cada dependencia de la API (1 disponible, 0 no).',
      labelNames: ['dependency'],
      registers: [metrics.registry],
      async collect() {
        const results = { ...mqtt.check(), ...(await database.check()) };
        for (const [dependency, { status }] of Object.entries(results)) {
          this.labels(dependency).set(status === 'up' ? 1 : 0);
        }
      },
    });
  }
}
