import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { STATE_PRESENTATION } from '../src/app/ui/presentation.ts';

/**
 * Lámina del sistema de diseño para el dosier (LF-104): colores, estados,
 * tipografía, espaciado y radios dibujados con los tokens reales de la build
 * (`@logicflows/design-tokens`, ADR-0020). Es una captura de referencia más
 * (LF-110): si cambia un token, la lámina cambia y hay que actualizarla, así
 * que nunca se queda atrás respecto al visor.
 */

const WWW = fileURLToPath(new URL('../www/', import.meta.url));
const STYLES = readdirSync(WWW).find((file) => /^styles-.*\.css$/.test(file));

const COLORS = [
  ['Fondo', 'surface-0'],
  ['Superficie', 'surface-1'],
  ['Superficie 2', 'surface-2'],
  ['Superficie 3', 'surface-3'],
  ['Borde', 'border'],
  ['Borde fuerte', 'border-strong'],
  ['Texto', 'text'],
  ['Texto secundario', 'text-muted'],
  ['Texto terciario', 'text-subtle'],
  ['Primario', 'primary'],
  ['Tinta', 'ink'],
  ['Foco', 'focus'],
] as const;

const TYPE_SCALE = [
  ['2xl', '32 px · títulos de página', 'Panel de células'],
  ['xl', '28 px · cifras destacadas', '15.234'],
  ['lg', '20 px · títulos de tarjeta', 'cell-01 · Planta demo'],
  ['md', '16 px · texto', 'Palé capa 3 de 5, 4 de 8 cajas'],
  ['sm', '14 px · texto secundario', 'Disponibilidad de hoy'],
  ['xs', '12 px · etiquetas', 'ROB-002 · Alta'],
] as const;

const SPACES = ['1', '2', '3', '4', '5', '6', '8'] as const;
const RADII = ['sm', 'md', 'lg', 'xl', 'full'] as const;

const SHEET = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/${STYLES ?? ''}">
<style>
  html, body { position: static; overflow: visible; height: auto; max-height: none; }
  body { margin: 0; background: var(--lf-color-surface-0); color: var(--lf-color-text);
    font-family: var(--lf-font-sans); font-size: var(--lf-font-size-md); }
  main { width: 1120px; padding: var(--lf-space-8); box-sizing: border-box; }
  header { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 1px solid var(--lf-color-border); padding-bottom: var(--lf-space-4); }
  h1 { font-size: var(--lf-font-size-2xl); font-weight: var(--lf-font-weight-semibold);
    line-height: var(--lf-line-height-tight); margin: 0; }
  h2 { font-size: var(--lf-font-size-xs); font-weight: var(--lf-font-weight-semibold);
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--lf-color-text-muted);
    margin: var(--lf-space-8) 0 var(--lf-space-3); }
  .lead { color: var(--lf-color-text-muted); font-size: var(--lf-font-size-sm); margin: 0; }
  .mono { font-family: var(--lf-font-mono); }
  .panel { background: var(--lf-color-surface-1); border: 1px solid var(--lf-color-border);
    border-radius: var(--lf-radius-xl); box-shadow: var(--lf-shadow-1); padding: var(--lf-space-5); }
  .colors { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--lf-space-3); }
  .swatch { display: flex; flex-direction: column; gap: var(--lf-space-1); font-size: var(--lf-font-size-xs); }
  .chip { height: 56px; border-radius: var(--lf-radius-lg); border: 1px solid var(--lf-color-border); }
  .swatch strong { font-weight: var(--lf-font-weight-medium); font-size: var(--lf-font-size-sm); }
  .swatch span { color: var(--lf-color-text-muted); }
  .states { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--lf-space-3); }
  .state { display: flex; flex-direction: column; gap: var(--lf-space-2); }
  .badge { display: inline-flex; align-items: center; gap: var(--lf-space-2); align-self: start;
    padding: var(--lf-space-1) var(--lf-space-3); border-radius: var(--lf-radius-full);
    font-weight: var(--lf-font-weight-semibold); font-size: var(--lf-font-size-sm); }
  .badge::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
  .state small { color: var(--lf-color-text-muted); font-size: var(--lf-font-size-xs); }
  .attention { border-left: 4px solid var(--fg); padding-left: var(--lf-space-3); }
  .columns { display: grid; grid-template-columns: 3fr 2fr; gap: var(--lf-space-6); }
  .type { display: grid; grid-template-columns: 200px 1fr; align-items: baseline;
    gap: var(--lf-space-2) var(--lf-space-4); }
  .type span { color: var(--lf-color-text-muted); font-size: var(--lf-font-size-xs); }
  .space { display: grid; grid-template-columns: 64px 1fr; align-items: center;
    gap: var(--lf-space-2) var(--lf-space-3); font-size: var(--lf-font-size-xs); }
  .bar { height: 12px; background: var(--lf-color-primary); border-radius: var(--lf-radius-sm); }
  .radii { display: flex; gap: var(--lf-space-3); margin-top: var(--lf-space-5); }
  .radius { width: 56px; height: 56px; background: var(--lf-color-surface-3);
    border: 1px solid var(--lf-color-border-strong); display: grid; place-items: center;
    font-size: var(--lf-font-size-xs); }
</style>
</head>
<body>
<main>
  <header>
    <div>
      <h1>LogicFlows · Sistema de diseño</h1>
      <p class="lead">Interfaz neutra; el color intenso solo para lo anómalo (ISA-101). Contraste WCAG 2.2 AA en cada par.</p>
    </div>
    <p class="lead mono" id="theme"></p>
  </header>

  <h2>Estados de la célula</h2>
  <div class="states">
    ${Object.values(STATE_PRESENTATION)
      .map(
        (state) => `<div class="panel state${state.attention ? ' attention' : ''}"
          style="--fg: var(--lf-color-${state.tone}-fg)">
          <span class="badge" style="color: var(--lf-color-${state.tone}-fg);
            background: var(--lf-color-${state.tone}-bg)">${state.label}</span>
          <small>${state.attention ? 'Requiere atención: borde de color' : 'Normal: sin destacar'}</small>
        </div>`,
      )
      .join('')}
    <div class="panel state">
      <strong>Nunca solo el color</strong>
      <small>Cada estado combina icono, texto y color, y lo que requiere atención se destaca con el borde.</small>
    </div>
  </div>

  <h2>Color</h2>
  <div class="colors">
    ${COLORS.map(
      ([label, token]) => `<div class="swatch">
        <div class="chip" style="background: var(--lf-color-${token})"></div>
        <strong>${label}</strong><span class="mono" data-token="--lf-color-${token}"></span>
      </div>`,
    ).join('')}
  </div>

  <div class="columns">
    <section>
      <h2>Tipografía · Inter y JetBrains Mono</h2>
      <div class="panel type">
        ${TYPE_SCALE.map(
          ([size, note, sample]) => `<span>${note}</span>
          <div class="${/\d/.test(sample) && size === 'xl' ? 'mono' : ''}"
            style="font-size: var(--lf-font-size-${size}); line-height: var(--lf-line-height-tight)">${sample}</div>`,
        ).join('')}
        <span>Cifras y códigos</span><div class="mono">820 cajas/h · 4,2 s · 92 %</div>
      </div>
    </section>
    <section>
      <h2>Espaciado y radios</h2>
      <div class="panel">
        <div class="space">
          ${SPACES.map(
            (step) =>
              `<span class="mono">${String(Number(step) * 4)} px</span><div class="bar" style="width: var(--lf-space-${step})"></div>`,
          ).join('')}
        </div>
        <div class="radii">
          ${RADII.map((radius) => `<div class="radius" style="border-radius: var(--lf-radius-${radius})">${radius}</div>`).join('')}
        </div>
      </div>
    </section>
  </div>
</main>
</body>
</html>`;

test.use({ serviceWorkers: 'block', viewport: { width: 1120, height: 900 } });

for (const colorScheme of ['light', 'dark'] as const) {
  const theme = colorScheme === 'light' ? 'claro' : 'oscuro';
  test(`lámina del sistema de diseño, tema ${theme}`, async ({ page }) => {
    expect(STYLES, 'la build del visor debe existir (ng build)').toBeDefined();
    await page.route('**/lamina', (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: SHEET }),
    );
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.goto('/lamina');
    // Los valores se leen de los tokens ya aplicados: la lámina no los repite.
    await page.evaluate((label) => {
      const root = getComputedStyle(document.documentElement);
      for (const element of document.querySelectorAll<HTMLElement>('[data-token]')) {
        element.textContent = root.getPropertyValue(element.dataset['token'] ?? '').trim();
      }
      const themeLabel = document.getElementById('theme');
      if (themeLabel) themeLabel.textContent = `Tema ${label}`;
    }, theme);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('main')).toHaveScreenshot(`sistema-de-diseno-${theme}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.002,
    });
  });
}
