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

/** Si una trama del canal en tiempo real es una actualización de la célula. */
function isCellUpdate(payload: string | Buffer): boolean {
  try {
    const message = JSON.parse(payload.toString()) as { type?: string; cell?: { cellId?: string } };
    return message.type === 'cell' && message.cell?.cellId === CELL_ID;
  } catch {
    return false;
  }
}

test('los datos de la célula llegan al visor en tiempo real', async ({ page }) => {
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

  // Actualizaciones de la célula que llegan por el canal en tiempo real.
  let updates = 0;
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (isCellUpdate(payload)) updates += 1;
    });
  });

  await expect(page.getByRole('status')).toHaveText('En directo');
  const card = page.locator('ion-card').filter({ hasText: CELL_ID });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('state')).not.toBeEmpty();

  // En producción, el guion diario (ADR-0019) detiene la célula a horas fijas:
  // no se exige un estado concreto. Lo que demuestra el sistema de extremo a
  // extremo es que llegan datos nuevos sin recargar; parada, la célula sigue
  // enviando su telemetría de latido.
  const seen = updates;
  await expect.poll(() => updates).toBeGreaterThan(seen);

  // Si produce, la caja siguiente aparece en la tarjeta.
  if ((await card.getByTestId('state').textContent())?.trim() === 'Produciendo') {
    const before = (await boxesShown(card)) ?? 0;
    await expect.poll(() => boxesShown(card)).toBeGreaterThan(before);
  }
  expect(violations).toEqual([]);
});

test('el histórico de la célula se carga desde la API (LF-81)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);
  await page.locator('#kc-login').click();

  await page.getByRole('link', { name: `Histórico de ${CELL_ID}` }).click();
  await expect(page.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  // Por días también responde: la zona horaria del navegador es válida para la API.
  await page.getByRole('button', { name: '7 días' }).click();
  await expect(page.getByRole('heading', { name: 'Paradas por causa' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
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
