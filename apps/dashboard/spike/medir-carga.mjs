// Usuario que vuelve: con sesión y sin service worker, recarga en «Fast 3G» con CPU x4.
import { chromium } from '@playwright/test';
const runs = Number(process.argv[2] ?? 3);
const browser = await chromium.launch();
const context = await browser.newContext({ locale: 'es-ES', serviceWorkers: 'block' });
const page = await context.newPage();
await page.goto('http://localhost:8100/');
await page.locator('#username').fill('operario');
await page.locator('#password').fill('operario-local');
await page.locator('#kc-login').click();
await page.getByTestId('boxes').first().waitFor();
const cdp = await context.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 562.5, downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9 });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const out = [];
for (let i = 0; i < runs; i++) {
  const start = Date.now();
  await page.reload({ waitUntil: 'commit' });
  await page.getByTestId('boxes').first().waitFor({ timeout: 120000 });
  const datos = Date.now() - start;
  const fcp = await page.evaluate(() => Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1));
  const bytes = await page.evaluate(() => performance.getEntriesByType('resource').concat(performance.getEntriesByType('navigation')).reduce((s, e) => s + (e.transferSize || 0), 0));
  out.push({ fcp, datos, kb: Math.round(bytes / 1024) });
}
console.log(JSON.stringify(out));
await browser.close();
