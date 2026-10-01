import { defineConfig, devices } from '@playwright/test';

const PORT = 4300;

/** Pruebas del visor en un navegador real contra su build de producción. */
export default defineConfig({
  testDir: '.',
  // La prueba del sistema completo tiene su propia configuración.
  testIgnore: 'system/**',
  fullyParallel: true,
  forbidOnly: process.env['CI'] !== undefined,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['github']],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node static-server.ts',
    cwd: import.meta.dirname,
    env: { PORT: String(PORT) },
    url: `http://localhost:${String(PORT)}/index.html`,
    reuseExistingServer: false,
  },
});
