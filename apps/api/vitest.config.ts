import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Las pruebas leen el código fuente del contrato sin compilarlo (ADR-0005).
  ssr: {
    resolve: {
      conditions: ['@logicflows/source', 'module', 'node', 'development|production'],
    },
  },
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.integration.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/main.ts'],
      reporter: ['text-summary'],
    },
  },
});
