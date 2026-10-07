/**
 * Genera los iconos y la pantalla de arranque del visor a partir del
 * pictograma (marca/pictograma.svg) y de los colores de la marca (LF-109):
 * los de la PWA en public/ y los de Android en android/app/src/main/res/.
 *
 *   pnpm --filter @logicflows/dashboard marca
 *
 * Dibuja con el Chromium de Playwright, ya instalado para las pruebas, así que
 * no necesita otra herramienta de imágenes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

/**
 * Colores de la marca, tomados de los tokens de diseño (ADR-0020): el fondo es
 * la tinta y el palé, el primario del tema oscuro, que destaca sobre ella. El
 * palé ya no es ámbar: en el visor, el ámbar significa «en espera» (ISA-101).
 */
const BRAND = { fondo: '#091426', cajas: '#ffffff', pale: '#38bdf8' } as const;

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const pictogram = readFileSync(root('marca/pictograma.svg'), 'utf8').replace(/<!--[\s\S]*?-->/, '');

type Shape = 'cuadrado' | 'redondeado' | 'circulo' | 'transparente';

interface Target {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly shape: Shape;
  /** Fracción del lado menor que ocupa el pictograma. */
  readonly scale: number;
}

const ANDROID = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 } as const;
const SPLASH = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
} as const;

const targets: Target[] = [
  // PWA y navegador. El icono «maskable» deja el dibujo dentro de la zona
  // segura del 80 %; los demás ocupan casi todo el lienzo.
  { path: 'public/favicon.png', width: 32, height: 32, shape: 'redondeado', scale: 0.9 },
  {
    path: 'public/icons/apple-touch-icon.png',
    width: 180,
    height: 180,
    shape: 'cuadrado',
    scale: 0.8,
  },
  { path: 'public/icons/icon-192.png', width: 192, height: 192, shape: 'redondeado', scale: 0.85 },
  { path: 'public/icons/icon-512.png', width: 512, height: 512, shape: 'redondeado', scale: 0.85 },
  {
    path: 'public/icons/icon-maskable-512.png',
    width: 512,
    height: 512,
    shape: 'cuadrado',
    scale: 0.62,
  },
  // Android: icono clásico, redondo y la capa delantera del adaptativo, cuyo
  // contenido debe caber en los 66 dp centrales de 108 dp.
  ...Object.entries(DENSITIES).flatMap(([density, factor]): Target[] => [
    {
      path: `${ANDROID}/mipmap-${density}/ic_launcher.png`,
      width: 48 * factor,
      height: 48 * factor,
      shape: 'redondeado',
      scale: 0.85,
    },
    {
      path: `${ANDROID}/mipmap-${density}/ic_launcher_round.png`,
      width: 48 * factor,
      height: 48 * factor,
      shape: 'circulo',
      scale: 0.72,
    },
    {
      path: `${ANDROID}/mipmap-${density}/ic_launcher_foreground.png`,
      width: 108 * factor,
      height: 108 * factor,
      shape: 'transparente',
      scale: 0.58,
    },
  ]),
  // Pantalla de arranque, vertical y apaisada.
  ...Object.entries(SPLASH).flatMap(([density, [width, height]]): Target[] => [
    {
      path: `${ANDROID}/drawable-port-${density}/splash.png`,
      width,
      height,
      shape: 'cuadrado',
      scale: 0.3,
    },
    {
      path: `${ANDROID}/drawable-land-${density}/splash.png`,
      width: height,
      height: width,
      shape: 'cuadrado',
      scale: 0.3,
    },
  ]),
  {
    path: `${ANDROID}/drawable/splash.png`,
    width: 480,
    height: 320,
    shape: 'cuadrado',
    scale: 0.3,
  },
];

/** El SVG completo de un destino: fondo según la forma y el pictograma centrado. */
function compose({ width, height, shape, scale }: Target): string {
  const side = Math.min(width, height) * scale;
  const x = (width - side) / 2;
  const y = (height - side) / 2;
  const radius = Math.min(width, height) * 0.1875;
  const background = {
    cuadrado: `<rect width="${String(width)}" height="${String(height)}" fill="${BRAND.fondo}"/>`,
    redondeado: `<rect width="${String(width)}" height="${String(height)}" rx="${String(radius)}" fill="${BRAND.fondo}"/>`,
    circulo: `<circle cx="${String(width / 2)}" cy="${String(height / 2)}" r="${String(Math.min(width, height) / 2)}" fill="${BRAND.fondo}"/>`,
    transparente: '',
  }[shape];
  const drawing = pictogram
    .replace(
      '<svg ',
      `<svg x="${String(x)}" y="${String(y)}" width="${String(side)}" height="${String(side)}" `,
    )
    .replaceAll('var(--cajas)', BRAND.cajas)
    .replaceAll('var(--pale)', BRAND.pale);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}">${background}${drawing}</svg>`;
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${compose(target)}</body></html>`,
    );
    const png = await page.locator('svg').first().screenshot({ omitBackground: true });
    writeFileSync(root(target.path), png);
  }
  // El icono vectorial de la PWA, con fondo redondeado.
  writeFileSync(
    root('public/icons/icon.svg'),
    `${compose({ path: '', width: 512, height: 512, shape: 'redondeado', scale: 0.85 })}\n`,
  );
  await browser.close();
  console.log(`${String(targets.length + 1)} ficheros generados.`);
}

await main();
