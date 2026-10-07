import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { contrastRatio } from './contrast.ts';

const css = readFileSync(new URL('../tokens.css', import.meta.url), 'utf8').replaceAll(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** Declaraciones `--nombre: valor` del primer bloque que sigue a `selector {`. */
const block = (selector: string): Map<string, string> => {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`No se encuentra el bloque ${selector}`);
  }
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name ?? '',
      value?.trim() ?? '',
    ]),
  );
};

const light = block(':root');
const dark = block(':root.lf-dark');
const darkBySystem = block(':root:not(.lf-light)');
const themes = { claro: light, oscuro: dark };

const colorOf = (theme: Map<string, string>, name: string): string => {
  const value = theme.get(`--lf-color-${name}`) ?? light.get(`--lf-color-${name}`);
  if (value === undefined) {
    throw new Error(`Falta --lf-color-${name}`);
  }
  return value;
};

/** Texto normal sobre su fondo: 4,5:1 como mínimo (WCAG 1.4.3). */
const TEXT_PAIRS: [string, string][] = [
  ...['surface-0', 'surface-1', 'surface-2', 'surface-3'].flatMap((surface): [string, string][] => [
    ['text', surface],
    ['text-muted', surface],
  ]),
  ['text-subtle', 'surface-0'],
  ['text-subtle', 'surface-1'],
  ['text-subtle', 'surface-2'],
  ['primary', 'surface-0'],
  ['primary', 'surface-1'],
  ['on-primary', 'primary'],
  ['on-ink', 'ink'],
  ...['ok', 'info', 'neutral', 'warning', 'danger'].flatMap((tone): [string, string][] => [
    [`${tone}-fg`, 'surface-0'],
    [`${tone}-fg`, 'surface-1'],
    [`${tone}-fg`, 'surface-2'],
    [`${tone}-fg`, `${tone}-bg`],
    // Texto de una alarma sobre el fondo de su severidad.
    ['text', `${tone}-bg`],
  ]),
];

/** Bordes de controles e indicador de foco: 3:1 como mínimo (WCAG 1.4.11). */
const NON_TEXT_PAIRS: [string, string][] = [
  ['border-strong', 'surface-1'],
  ['border-strong', 'surface-2'],
  ['focus', 'surface-0'],
  ['focus', 'surface-1'],
];

describe('tokens de diseño (ADR-0020)', () => {
  describe.each(Object.entries(themes))('tema %s', (_name, theme) => {
    it.each(TEXT_PAIRS)('%s sobre %s tiene un contraste de 4,5:1', (fg, bg) => {
      expect(contrastRatio(colorOf(theme, fg), colorOf(theme, bg))).toBeGreaterThanOrEqual(4.5);
    });

    it.each(NON_TEXT_PAIRS)('%s sobre %s tiene un contraste de 3:1', (fg, bg) => {
      expect(contrastRatio(colorOf(theme, fg), colorOf(theme, bg))).toBeGreaterThanOrEqual(3);
    });
  });

  it('el tema oscuro es el mismo si lo elige el usuario o el sistema', () => {
    expect(Object.fromEntries(darkBySystem)).toEqual(Object.fromEntries(dark));
  });

  it.each(Object.entries(themes))(
    'en el tema %s, cada triplete -rgb coincide con su color',
    (_name, theme) => {
      const triplets = [...light.keys()].filter((name) => name.endsWith('-rgb'));
      expect(triplets.length).toBeGreaterThan(0);
      for (const name of triplets) {
        const hex = colorOf(theme, name.slice('--lf-color-'.length, -'-rgb'.length));
        const rgb = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
        expect(theme.get(name) ?? light.get(name), name).toBe(rgb.join(', '));
      }
    },
  );

  it('el tema oscuro redefine todos los colores del claro', () => {
    const colors = (theme: Map<string, string>) =>
      [...theme.keys()].filter((name) => name.startsWith('--lf-color-')).sort();
    expect(colors(dark)).toEqual(colors(light));
  });
});

describe('contrastRatio', () => {
  it('coincide con los valores de referencia de WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('rechaza los formatos que no son hexadecimales de 6 cifras', () => {
    expect(() => contrastRatio('#fff', '#000000')).toThrow('Color no admitido');
  });
});
