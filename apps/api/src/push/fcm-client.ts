import { SignJWT, importPKCS8 } from 'jose';
import { z } from 'zod';

import type { PushNotification } from './alarm-activations.ts';

/** Resultado de enviar un aviso a un dispositivo. */
export type SendResult = 'sent' | 'unregistered' | 'failed';

/** Envío de avisos a Firebase Cloud Messaging (ADR-0015). */
export interface FcmClient {
  /** Sin la cuenta de servicio no se envía nada. */
  readonly enabled: boolean;
  send(token: string, notification: PushNotification): Promise<SendResult>;
}

/** Token de inyección del cliente de FCM. */
export const FCM_CLIENT = Symbol('FCM_CLIENT');

/** Canal de notificaciones de Android que crea la app para las alarmas. */
export const ALARM_CHANNEL_ID = 'alarmas';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** Campos que se usan del JSON de la cuenta de servicio de Firebase. */
export const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().includes('PRIVATE KEY'),
});
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

export const disabledFcmClient: FcmClient = {
  enabled: false,
  send: () => Promise.resolve('failed'),
};

/**
 * Cliente de la API HTTP v1 de FCM. Se identifica ante Google con una
 * aserción JWT firmada con la clave de la cuenta de servicio, y reutiliza el
 * token de acceso hasta un minuto antes de que caduque.
 */
export class HttpFcmClient implements FcmClient {
  readonly enabled = true;
  #accessToken: { readonly value: string; readonly expiresAt: number } | undefined;

  constructor(
    private readonly account: ServiceAccount,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async send(token: string, notification: PushNotification): Promise<SendResult> {
    const response = await this.fetchFn(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.#token()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: notification.title, body: notification.body },
            data: notification.data,
            android: {
              priority: 'HIGH',
              // Pasada una hora, una alarma ya no sirve como aviso.
              ttl: '3600s',
              collapse_key: notification.collapseKey,
              notification: { channel_id: ALARM_CHANNEL_ID },
            },
          },
        }),
      },
    );
    if (response.ok) {
      return 'sent';
    }
    // FCM responde 404 (UNREGISTERED) cuando la app se desinstaló o el token caducó.
    return response.status === 404 ? 'unregistered' : 'failed';
  }

  async #token(): Promise<string> {
    if (this.#accessToken !== undefined && this.#accessToken.expiresAt - 60_000 > this.now()) {
      return this.#accessToken.value;
    }
    const issuedAt = Math.floor(this.now() / 1000);
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.account.client_email)
      .setSubject(this.account.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 3600)
      .sign(await importPKCS8(this.account.private_key, 'RS256'));
    const response = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!response.ok) {
      throw new Error(`Google rechazó la cuenta de servicio de FCM (${String(response.status)})`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.#accessToken = {
      value: body.access_token,
      expiresAt: this.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }
}
