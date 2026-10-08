import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { testProviders } from '../../../testing/providers';
import {
  AlarmNotificationsService,
  NATIVE_PUSH,
  NOTIFICATIONS_PREFERENCE_KEY,
  notificationTarget,
} from './alarm-notifications';

/** App nativa falsa: la prueba decide el permiso, el token y cuándo se toca un aviso. */
const fakePush = (permission = true) => {
  let registration: (token: string) => void = () => undefined;
  let opened: (data: unknown) => void = () => undefined;
  return {
    native: true,
    createAlarmChannel: vi.fn(() => Promise.resolve()),
    requestPermission: vi.fn(() => Promise.resolve(permission)),
    register: vi.fn(() => {
      registration('token-del-movil');
      return Promise.resolve();
    }),
    unregister: vi.fn(() => Promise.resolve()),
    onRegistration: (handler: (token: string) => void) => {
      registration = handler;
    },
    onNotificationOpened: (handler: (data: unknown) => void) => {
      opened = handler;
    },
    open: (data: unknown = { siteId: 'demo', cellId: 'cell-03' }) => {
      opened(data);
    },
  };
};

const DEVICES = 'http://api.test/api/v1/push/devices';

describe('avisos de alarmas en la app (LF-69)', () => {
  let http: HttpTestingController;

  const setup = (push: ReturnType<typeof fakePush>) => {
    TestBed.configureTestingModule({
      providers: [
        ...testProviders({ auth: true }),
        provideRouter([]),
        { provide: NATIVE_PUSH, useValue: push },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AlarmNotificationsService);
  };

  beforeEach(() => {
    localStorage.removeItem(NOTIFICATIONS_PREFERENCE_KEY);
  });

  afterEach(() => {
    http.verify();
  });

  it('tras iniciar sesión pide permiso y registra el dispositivo en la API', async () => {
    const push = fakePush();
    const service = setup(push);
    await service.start();
    expect(push.createAlarmChannel).toHaveBeenCalled();
    const registration = http.expectOne({ method: 'POST', url: DEVICES });
    expect(registration.request.body).toEqual({ token: 'token-del-movil' });
    registration.flush(null);
  });

  it('sin permiso no se registra', async () => {
    const push = fakePush(false);
    await setup(push).start();
    expect(push.register).not.toHaveBeenCalled();
    http.expectNone(DEVICES);
  });

  it('desactivarlos da de baja el dispositivo y se recuerda', async () => {
    const push = fakePush();
    const service = setup(push);
    await service.start();
    http.expectOne({ method: 'POST', url: DEVICES }).flush(null);

    const disabling = service.setEnabled(false);
    const removal = http.expectOne({ method: 'DELETE', url: DEVICES });
    expect(removal.request.body).toEqual({ token: 'token-del-movil' });
    removal.flush(null);
    await disabling;

    expect(push.unregister).toHaveBeenCalled();
    expect(service.enabled()).toBe(false);
    expect(localStorage.getItem(NOTIFICATIONS_PREFERENCE_KEY)).toBe('no');
  });

  it('con los avisos desactivados no pide permiso al arrancar', async () => {
    localStorage.setItem(NOTIFICATIONS_PREFERENCE_KEY, 'no');
    const push = fakePush();
    await setup(push).start();
    expect(push.requestPermission).not.toHaveBeenCalled();
  });

  it('al tocar un aviso abre el detalle de su célula, donde se reconoce (ADR-0022)', async () => {
    const push = fakePush();
    const service = setup(push);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    await service.start();
    http.expectOne({ method: 'POST', url: DEVICES }).flush(null);
    push.open();
    expect(navigate).toHaveBeenCalledWith('/cells/demo/cell-03');
  });

  it('un aviso con datos no válidos abre el panel', () => {
    expect(notificationTarget({ siteId: 'demo', cellId: '../admin' })).toBe('/cells');
    expect(notificationTarget(undefined)).toBe('/cells');
  });

  it('en el navegador no hay avisos', async () => {
    const push = { ...fakePush(), native: false };
    const service = setup(push);
    expect(service.available).toBe(false);
    await service.start();
    expect(push.requestPermission).not.toHaveBeenCalled();
  });
});
