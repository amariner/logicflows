import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Las pruebas leen el código fuente del contrato sin compilarlo (ADR-0005).
  // Vitest ejecuta las pruebas de Node.js en el entorno SSR de Vite, que usa
  // sus propias condiciones de resolución; se mantienen las predeterminadas.
  ssr: {
    resolve: {
      conditions: ['@logicflows/source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    include: ['src/**/*.integration.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
