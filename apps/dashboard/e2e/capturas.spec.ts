import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

import { mockApi } from './fixtures.ts';

/**
 * Capturas de referencia de las pantallas clave (LF-110): detectan cambios
 * visuales no deseados. Se generan y se comparan en la CI, en Linux; en local
 * se omiten (`ignoreSnapshots`), porque cada sistema dibuja el texto distinto.
 * Para actualizarlas, ver el README del visor.
 */

// Las peticiones del service worker no pasan por la API simulada.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

const SCREENS = [
  {
    name: 'panel',
    path: '/cells',
    ready: (page: Page) => expect(page.getByText('cell-07')).toBeVisible(),
  },
  {
    name: 'detalle',
    path: '/cells/demo/cell-03',
    ready: (page: Page) => expect(page.getByText('Robot averiado')).toBeVisible(),
  },
  {
    name: 'historico',
    path: '/cells/demo/cell-01/history',
    ready: (page: Page) => expect(page.getByTestId('event')).toHaveCount(5),
  },
] as const;

const VIEWPORTS = {
  escritorio: { width: 1280, height: 900 },
  movil: { width: 375, height: 812 },
} as const;

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    for (const screen of SCREENS) {
      const theme = colorScheme === 'light' ? 'claro' : 'oscuro';
      test(`${screen.name}, tema ${theme}, ${viewportName}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.setViewportSize(viewport);
        await page.goto(screen.path);
        await screen.ready(page);
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`${screen.name}-${theme}-${viewportName}.png`, {
          animations: 'disabled',
          caret: 'hide',
          // Diferencias de suavizado entre ejecuciones, no cambios de diseño.
          maxDiffPixelRatio: 0.002,
        });
      });
    }
  }
}
