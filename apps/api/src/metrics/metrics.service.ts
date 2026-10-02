import { hostname } from 'node:os';

import { Injectable } from '@nestjs/common';
import { Registry, collectDefaultMetrics } from 'prom-client';

/** Prefijo de las métricas propias de LogicFlows (ADR-0013). */
export const METRIC_PREFIX = 'logicflows_';

/**
 * Registro de métricas de la API en formato Prometheus (ADR-0013). Cada
 * aplicación tiene el suyo, en lugar del registro global de prom-client, para
 * que varias instancias en el mismo proceso, como en las pruebas, no choquen.
 * Los módulos registran aquí sus métricas y Grafana Cloud las recoge de
 * `/metrics`.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  constructor() {
    // Con varias réplicas, `replica` distingue la que respondió. No se llama
    // `instance` porque esa etiqueta la pone quien recoge las métricas.
    this.registry.setDefaultLabels({ service: 'api', replica: hostname() });
    // Métricas estándar de Node.js (CPU, memoria, bucle de eventos) con sus
    // nombres habituales, los que esperan los paneles de la comunidad.
    collectDefaultMetrics({ register: this.registry });
  }
}
