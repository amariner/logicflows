import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';

const CELL_ID = process.env['E2E_CELL_ID'] ?? 'cell-01';
// Usuario de pruebas del realm de infra/keycloak (solo desarrollo y
// previsualizaciones). En producción, el usuario de solo lectura de LF-57.
const USERNAME = process.env['E2E_USERNAME'] ?? 'operario';
const PASSWORD = process.env['E2E_PASSWORD'] ?? 'operario-local';

/** Cajas que muestra la tarjeta; `null` mientras no hay telemetría. */
async function boxesShown(card: Locator): Promise<number | null> {
  const text = (await card.getByTestId('boxes').textContent())?.trim() ?? '';
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : Number(digits);
}

test('una caja publicada por el simulador aparece en el visor', async ({ page }) => {
  // La política de seguridad de contenidos no debe bloquear nada del visor (LF-52).
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
      violations.push(message.text());
    }
  });

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
  expect(violations).toEqual([]);
});

test('el usuario de la prueba solo tiene permisos de lectura (LF-57)', async ({ page }) => {
  // El visor guarda el token en memoria: se lee de la primera petición a la API.
  const apiRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/api/v1/') &&
      (request.headers()['authorization'] ?? '').startsWith('Bearer '),
  );
  await page.goto('/');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();

  const token = ((await apiRequest).headers()['authorization'] ?? '').slice('Bearer '.length);
  const payload = token.split('.')[1] ?? '';
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    realm_access?: { roles?: string[] };
  };
  const roles = claims.realm_access?.roles ?? [];
  expect(roles).toContain('viewer');
  expect(roles).not.toContain('admin');
});

test('el visor es instalable: manifiesto y service worker (LF-55)', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('status')).toHaveText('En directo');

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel=manifest]');
    return link ? ((await (await fetch(link.href)).json()) as { display: string }) : null;
  });
  expect(manifest).toMatchObject({ display: 'standalone' });
  const worker = await page.evaluate(
    async () => (await navigator.serviceWorker.ready).active?.scriptURL,
  );
  expect(worker).toContain('ngsw-worker.js');

  // Sin conexión no se muestran datos antiguos como si fueran actuales.
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('En directo');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Sin conexión');
  await context.setOffline(false);
});
