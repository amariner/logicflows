import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi } from './fixtures.ts';

const VIEWPORTS = {
  escritorio: { width: 1280, height: 900 },
  tableta: { width: 800, height: 1100 },
  móvil: { width: 375, height: 812 },
} as const;

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`sin infracciones de WCAG 2.2 AA en ${name}, tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      await page.goto('/cells');
      await expect(page.getByText('cell-07')).toBeVisible();
      await expect(page.getByRole('status')).toHaveText('En directo');

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const summary = violations.map(
        (violation) =>
          `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`,
      );
      expect(summary).toEqual([]);
    });
  }
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`el histórico no tiene infracciones de WCAG 2.2 AA en ${name}, tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      await page.goto('/cells/demo/cell-01/history');
      await expect(page.getByText('Paradas por causa')).toBeVisible();
      await expect(page.getByTestId('event')).toHaveCount(5);
      // La tabla equivalente al gráfico también se revisa.
      await page.getByText('Ver los datos en una tabla').click();
      await expect(page.getByRole('table')).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }
}

test.describe('navegación al histórico', () => {
  // Las peticiones del service worker no pasan por la API simulada.
  test.use({ serviceWorkers: 'block' });

  test('desde la tarjeta de una célula se llega a su histórico', async ({ page }) => {
    await page.goto('/cells');
    await page.getByRole('link', { name: 'Histórico de cell-01' }).click();
    await expect(page).toHaveURL(/\/cells\/demo\/cell-01\/history$/);
    await expect(page.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
  });
});

test('el histórico se reajusta a 320 px sin desplazamiento horizontal (WCAG 1.4.10)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/cells/demo/cell-01/history');
  await expect(page.getByText('Paradas por causa')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`los valores y las alarmas usan el color principal del texto, tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/cells');
    const card = page.locator('ion-card').filter({ hasText: 'cell-03' });
    await expect(card).toBeVisible();

    const textColor = await page.evaluate(() => getComputedStyle(document.body).color);
    for (const element of [
      card.getByTestId('boxes'),
      card.getByTestId('pallets'),
      card.getByTestId('alarm').first(),
    ]) {
      await expect(element).toHaveCSS('color', textColor);
    }
  });
}

test('el contenido se reajusta a 320 px sin desplazamiento horizontal (WCAG 1.4.10)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/cells');
  await expect(page.getByText('cell-01')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('la página declara el idioma español', async ({ page }) => {
  await page.goto('/cells');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
});

test('en escritorio se llega al menú con el teclado y el foco es visible', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.escritorio);
  await page.goto('/cells');
  await expect(page.getByText('cell-01')).toBeVisible();

  const menuEntry = page.getByRole('link', { name: 'Células' });
  for (let i = 0; i < 10 && !(await menuEntry.evaluate((el) => el.matches(':focus-within'))); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(menuEntry).toBeFocused();
});

test('en móvil el menú se abre con el teclado', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.móvil);
  await page.goto('/cells');
  await expect(page.getByText('cell-01')).toBeVisible();

  const menuButton = page.getByRole('button', { name: 'Abrir el menú' });
  for (
    let i = 0;
    i < 10 && !(await menuButton.evaluate((el) => el.matches(':focus-within')));
    i++
  ) {
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  await expect(page.getByRole('link', { name: 'Células' })).toBeVisible();
});
