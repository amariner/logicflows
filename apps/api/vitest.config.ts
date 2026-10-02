import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Las pruebas leen el código fuente del contrato sin compilarlo (ADR-0005).
  ssr: {
    resolve: {
      // Sin «module»: con esa condición se cargaba la versión ESM de
      // @opentelemetry/api (la importa prom-client), cuyas rutas sin
      // extensión no resuelve Node.
      conditions: ['@logicflows/source', 'node', 'development|production'],
    },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/testing/**'],
      reporter: ['text-summary'],
    },
  },
});
