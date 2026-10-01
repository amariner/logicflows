import { defineConfig, devices } from '@playwright/test';

/**
 * Prueba de extremo a extremo contra el sistema completo en contenedores
 * (`pnpm stack:up`): simulador, broker, API, base de datos y visor reales.
 */
export default defineConfig({
  testDir: '.',
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
  // El simulador produce una caja cada pocos segundos.
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:8100',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
