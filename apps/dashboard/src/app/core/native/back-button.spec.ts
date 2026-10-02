import { describe, expect, it, vi } from 'vitest';

import { exitOnRootBackButton } from './back-button';

const fakePlatform = () => {
  const handlers: { priority: number; handler: () => void }[] = [];
  return {
    handlers,
    backButton: {
      subscribeWithPriority: (priority: number, handler: () => void) => {
        handlers.push({ priority, handler });
      },
    },
  };
};

describe('botón atrás de Android', () => {
  it('se registra con la prioridad más baja, detrás de la navegación de Ionic', () => {
    const platform = fakePlatform();
    exitOnRootBackButton(
      platform,
      () => true,
      vi.fn(() => Promise.resolve()),
    );
    expect(platform.handlers.map((h) => h.priority)).toEqual([-1]);
  });

  it('en la pantalla inicial cierra la app', () => {
    const platform = fakePlatform();
    const exitApp = vi.fn(() => Promise.resolve());
    exitOnRootBackButton(platform, () => false, exitApp);
    platform.handlers[0]?.handler();
    expect(exitApp).toHaveBeenCalledOnce();
  });

  it('si se puede volver atrás, no cierra la app', () => {
    const platform = fakePlatform();
    const exitApp = vi.fn(() => Promise.resolve());
    exitOnRootBackButton(platform, () => true, exitApp);
    platform.handlers[0]?.handler();
    expect(exitApp).not.toHaveBeenCalled();
  });
});
