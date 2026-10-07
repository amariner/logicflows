import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme';

const view = document.defaultView as Window;
const classes = () => [...document.documentElement.classList].sort();

/** Sustituye la preferencia del sistema; devuelve cómo cambiarla. */
const systemPrefersDark = (initial: boolean) => {
  const listeners: ((event: { matches: boolean }) => void)[] = [];
  Object.defineProperty(view, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: initial,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        listeners.push(listener);
      },
    }),
  });
  return (matches: boolean) => {
    for (const listener of listeners) {
      listener({ matches });
    }
  };
};

describe('tema claro y oscuro (LF-105)', () => {
  beforeEach(() => {
    view.localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(view, 'matchMedia');
    document.documentElement.className = '';
  });

  it('sin elección, sigue al sistema también cuando cambia', () => {
    const change = systemPrefersDark(true);
    const theme = TestBed.inject(ThemeService);
    expect(theme.preference()).toBe('system');
    expect(classes()).toEqual(['ion-palette-dark', 'lf-dark']);

    change(false);
    expect(theme.dark()).toBe(false);
    expect(classes()).toEqual(['lf-light']);
  });

  it('la elección del usuario manda sobre el sistema y se recuerda', () => {
    const change = systemPrefersDark(true);
    TestBed.inject(ThemeService).choose('light');
    expect(classes()).toEqual(['lf-light']);
    change(true);
    expect(classes()).toEqual(['lf-light']);

    TestBed.resetTestingModule();
    const restored = TestBed.inject(ThemeService);
    expect(restored.preference()).toBe('light');
    restored.choose('dark');
    expect(classes()).toEqual(['ion-palette-dark', 'lf-dark']);
  });

  it('ignora un valor guardado desconocido', () => {
    view.localStorage.setItem('logicflows.theme', 'sepia');
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
  });

  it('sin preferencia del sistema disponible, usa el claro', () => {
    expect(TestBed.inject(ThemeService).dark()).toBe(false);
    expect(classes()).toEqual(['lf-light']);
  });
});
