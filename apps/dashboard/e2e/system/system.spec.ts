import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

const CELL_ID = process.env['E2E_CELL_ID'] ?? 'cell-01';
// Usuario de pruebas del realm de infra/keycloak (solo desarrollo y previsualizaciones).
const USERNAME = process.env['E2E_USERNAME'] ?? 'operario';
const PASSWORD = process.env['E2E_PASSWORD'] ?? 'operario-local';

/** Cajas que muestra la tarjeta; `null` mientras no hay telemetría. */
async function boxesShown(card: Locator): Promise<number | null> {
  const text = (await card.getByTestId('boxes').textContent())?.trim() ?? '';
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

test('una caja publicada por el simulador aparece en el visor', async ({ page }) => {
  // Sin sesión, el visor lleva al inicio de sesión del proveedor de identidad.
  await page.goto('/');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();

  await expect(page.getByRole('status')).toHaveText('En directo');
  const card = page.locator('ion-card').filter({ hasText: CELL_ID });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('state')).toHaveText('Produciendo');

  // Sin recargar la página: la caja siguiente llega por el canal en tiempo real.
  const before = (await boxesShown(card)) ?? 0;
  await expect.poll(() => boxesShown(card)).toBeGreaterThan(before);
});
