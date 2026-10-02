import { decodeJwt, exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it, vi } from 'vitest';

import { HttpFcmClient } from './fcm-client.ts';
import type { ServiceAccount } from './fcm-client.ts';

const NOTIFICATION = {
  title: 'Alarma alta en LogicFlows',
  body: 'demo / cell-01',
  data: { siteId: 'demo', cellId: 'cell-01' },
  collapseKey: 'demo/cell-01',
};

const account = async (): Promise<ServiceAccount> => {
  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  return {
    project_id: 'logicflows-pruebas',
    client_email: 'avisos@logicflows-pruebas.iam.gserviceaccount.com',
    private_key: await exportPKCS8(privateKey),
  };
};

const urlOf = (input: unknown): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : '';
const bodyOf = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string'
    ? init.body
    : init?.body instanceof URLSearchParams
      ? init.body.toString()
      : '';

/** Google falso: responde al token y a FCM con lo que indique la prueba. */
const fakeGoogle = (sendStatus = 200) =>
  vi.fn<typeof fetch>((input) => {
    const url = urlOf(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return Promise.resolve(Response.json({ access_token: 'acceso', expires_in: 3600 }));
    }
    return Promise.resolve(new Response('{}', { status: sendStatus }));
  });

describe('cliente de Firebase Cloud Messaging', () => {
  it('se identifica con una aserción firmada por la cuenta de servicio y envía el aviso', async () => {
    const fetchFn = fakeGoogle();
    const client = new HttpFcmClient(await account(), fetchFn);

    expect(await client.send('token-1', NOTIFICATION)).toBe('sent');

    const [tokenUrl, tokenInit] = fetchFn.mock.calls[0] ?? [];
    expect(urlOf(tokenUrl)).toBe('https://oauth2.googleapis.com/token');
    const assertion = new URLSearchParams(bodyOf(tokenInit)).get('assertion') ?? '';
    expect(decodeJwt(assertion)).toMatchObject({
      iss: 'avisos@logicflows-pruebas.iam.gserviceaccount.com',
      aud: 'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    });

    const [sendUrl, sendInit] = fetchFn.mock.calls[1] ?? [];
    expect(urlOf(sendUrl)).toBe(
      'https://fcm.googleapis.com/v1/projects/logicflows-pruebas/messages:send',
    );
    expect(new Headers(sendInit?.headers).get('authorization')).toBe('Bearer acceso');
    expect(JSON.parse(bodyOf(sendInit))).toEqual({
      message: {
        token: 'token-1',
        notification: { title: NOTIFICATION.title, body: NOTIFICATION.body },
        data: NOTIFICATION.data,
        android: {
          priority: 'HIGH',
          ttl: '3600s',
          collapse_key: 'demo/cell-01',
          notification: { channel_id: 'alarmas' },
        },
      },
    });
  });

  it('reutiliza el token de acceso mientras no esté a punto de caducar', async () => {
    let now = Date.parse('2026-10-05T08:00:00Z');
    const fetchFn = fakeGoogle();
    const client = new HttpFcmClient(await account(), fetchFn, () => now);

    await client.send('token-1', NOTIFICATION);
    await client.send('token-2', NOTIFICATION);
    const tokenRequests = () =>
      fetchFn.mock.calls.filter(([url]) => urlOf(url).includes('oauth2')).length;
    expect(tokenRequests()).toBe(1);

    now += 3600_000 - 30_000;
    await client.send('token-3', NOTIFICATION);
    expect(tokenRequests()).toBe(2);
  });

  it('distingue un dispositivo dado de baja de un fallo', async () => {
    expect(
      await new HttpFcmClient(await account(), fakeGoogle(404)).send('viejo', NOTIFICATION),
    ).toBe('unregistered');
    expect(await new HttpFcmClient(await account(), fakeGoogle(503)).send('t', NOTIFICATION)).toBe(
      'failed',
    );
  });
});
