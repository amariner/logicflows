import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Tema que elige el usuario: el del sistema, claro u oscuro. */
export type ThemePreference = 'system' | 'light' | 'dark';

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const STORAGE_KEY = 'logicflows.theme';

/**
 * Tema claro u oscuro del visor (ADR-0020). Sigue al sistema hasta que el
 * usuario elige uno, y recuerda la elección en el dispositivo.
 *
 * Pone en la raíz del documento la clase de los tokens (`lf-dark` o
 * `lf-light`) y la de la paleta oscura de Ionic (`ion-palette-dark`), para
 * que los dos cambien a la vez. Antes de que arranque la aplicación, los
 * tokens ya siguen al sistema por sí solos.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly #document = inject(DOCUMENT);
  readonly #storage = storage(this.#document.defaultView);
  readonly #systemDark = signal(false);
  readonly #preference = signal<ThemePreference>(this.#stored());

  /** El tema elegido por el usuario. */
  readonly preference = this.#preference.asReadonly();
  /** Si se ve en oscuro, por elección del usuario o del sistema. */
  readonly dark = computed(() =>
    this.#preference() === 'system' ? this.#systemDark() : this.#preference() === 'dark',
  );

  constructor() {
    const view = this.#document.defaultView;
    const query =
      view && 'matchMedia' in view ? view.matchMedia('(prefers-color-scheme: dark)') : undefined;
    if (query !== undefined) {
      this.#systemDark.set(query.matches);
      query.addEventListener('change', (event) => {
        this.#systemDark.set(event.matches);
        this.#apply();
      });
    }
    this.#apply();
  }

  choose(preference: ThemePreference): void {
    this.#preference.set(preference);
    try {
      this.#storage?.setItem(STORAGE_KEY, preference);
    } catch {
      // Sin almacenamiento (navegación privada): la elección dura la sesión.
    }
    this.#apply();
  }

  #stored(): ThemePreference {
    try {
      const value = this.#storage?.getItem(STORAGE_KEY);
      return PREFERENCES.find((preference) => preference === value) ?? 'system';
    } catch {
      return 'system';
    }
  }

  #apply(): void {
    const dark = this.dark();
    const root = this.#document.documentElement;
    root.classList.toggle('lf-dark', dark);
    root.classList.toggle('lf-light', !dark);
    root.classList.toggle('ion-palette-dark', dark);
  }
}

/** El almacenamiento local, si el navegador deja usarlo. */
function storage(view: Window | null): Storage | undefined {
  try {
    return view?.localStorage;
  } catch {
    return undefined;
  }
}
