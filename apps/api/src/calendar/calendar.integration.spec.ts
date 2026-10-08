import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../testing/app.ts';
import { testIssuer } from '../testing/auth.ts';
import { API_PASSWORD, startBroker } from '../testing/broker.ts';
import type { TestBroker } from '../testing/broker.ts';
import { startDatabase } from '../testing/database.ts';
import { CalendarService } from './calendar.service.ts';
import type { CalendarView, VersionView } from './calendar.service.ts';

const DAY_MS = 86_400_000;
/** Una fecha a `days` días de hoy: siempre futura o pasada, sea cual sea la zona. */
const inDays = (days: number): string =>
  new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);

const weekdayShifts = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, start: 6, end: 14, name: 'Mañana' },
  { weekday, start: 14, end: 22, name: 'Tarde' },
]);

describe('calendario de turnos (ADR-0021)', () => {
  let broker: TestBroker;
  let database: Awaited<ReturnType<typeof startDatabase>>;
  let app: INestApplication;
  let admin: string;
  let viewer: string;
  const http = (token: string) =>
    request.agent(app.getHttpServer() as Server).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    [broker, database] = await Promise.all([startBroker(), startDatabase()]);
    const issuer = await testIssuer();
    admin = await issuer.token({ subject: 'u-admin', name: 'jefa.planta', roles: ['admin'] });
    viewer = await issuer.token({ subject: 'u-viewer', name: 'operario', roles: ['viewer'] });
    app = await createApp({
      DATABASE_URL: database.getConnectionUri(),
      MQTT_URL: broker.url,
      MQTT_API_PASSWORD: API_PASSWORD,
    });
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await Promise.all([broker.container.stop(), database.stop()]);
  });

  it('una planta sin calendario no tiene versiones', async () => {
    const response = await http(viewer).get('/api/v1/sites/demo/calendar').expect(200);
    expect(response.body).toMatchObject({ siteId: 'demo', current: null, versions: [] });
  });

  it('solo admin puede cambiar el calendario', async () => {
    await http(viewer)
      .put(`/api/v1/sites/demo/calendar/versions/${inDays(10)}`)
      .send({ timeZone: 'Europe/Madrid', shifts: weekdayShifts })
      .expect(403);
  });

  it('crea una versión futura y la sustituye', async () => {
    const effectiveFrom = inDays(10);
    const created = await http(admin)
      .put(`/api/v1/sites/demo/calendar/versions/${effectiveFrom}`)
      .send({ timeZone: 'Europe/Madrid', shifts: weekdayShifts })
      .expect(201);
    expect(created.body).toMatchObject({
      effectiveFrom,
      timeZone: 'Europe/Madrid',
      createdBy: 'jefa.planta',
    });
    expect((created.body as VersionView).shifts).toHaveLength(10);

    await http(admin)
      .put(`/api/v1/sites/demo/calendar/versions/${effectiveFrom}`)
      .send({ timeZone: 'Europe/Madrid', shifts: weekdayShifts.slice(0, 2) })
      .expect(200);
    const view = (await http(viewer).get('/api/v1/sites/demo/calendar').expect(200))
      .body as CalendarView;
    expect(view.current).toBeNull();
    expect(view.versions).toHaveLength(1);
    expect(view.versions[0]?.shifts).toEqual(weekdayShifts.slice(0, 2));
  });

  it('no deja tocar el pasado ni hoy', async () => {
    for (const day of [inDays(-1), inDays(-30)]) {
      const response = await http(admin)
        .put(`/api/v1/sites/demo/calendar/versions/${day}`)
        .send({ timeZone: 'Europe/Madrid', shifts: weekdayShifts })
        .expect(409);
      expect((response.body as { detail: string }).detail).toMatch(/el pasado no se reescribe/);
    }
  });

  it('rechaza turnos que se solapan y zonas horarias desconocidas', async () => {
    const overlap = await http(admin)
      .put(`/api/v1/sites/demo/calendar/versions/${inDays(12)}`)
      .send({
        timeZone: 'Europe/Madrid',
        shifts: [
          { weekday: 1, start: 6, end: 14, name: 'Mañana' },
          { weekday: 1, start: 13, end: 21, name: 'Tarde' },
        ],
      })
      .expect(400);
    expect(JSON.stringify(overlap.body)).toMatch(/se solapan/);
    await http(admin)
      .put(`/api/v1/sites/demo/calendar/versions/${inDays(12)}`)
      .send({ timeZone: 'Marte/Olympus', shifts: [] })
      .expect(400);
  });

  it('marca días futuros sin turnos solo si hay calendario ese día', async () => {
    const holiday = inDays(15);
    const created = await http(admin)
      .put(`/api/v1/sites/demo/calendar/exceptions/${holiday}`)
      .send({ name: 'Festivo local' })
      .expect(201);
    expect(created.body).toMatchObject({ date: holiday, name: 'Festivo local' });
    await http(admin)
      .put(`/api/v1/sites/demo/calendar/exceptions/${holiday}`)
      .send({ name: 'Mantenimiento' })
      .expect(200);
    // Antes de la primera versión no hay calendario.
    await http(admin)
      .put(`/api/v1/sites/demo/calendar/exceptions/${inDays(5)}`)
      .send({ name: 'Festivo' })
      .expect(409);
    await http(admin)
      .put(`/api/v1/sites/otra/calendar/exceptions/${holiday}`)
      .send({ name: 'Festivo' })
      .expect(409);

    const view = (await http(viewer).get('/api/v1/sites/demo/calendar').expect(200))
      .body as CalendarView;
    expect(view.exceptions).toEqual([
      expect.objectContaining({ date: holiday, name: 'Mantenimiento' }),
    ]);
    await http(admin).delete(`/api/v1/sites/demo/calendar/exceptions/${holiday}`).expect(204);
    await http(admin).delete(`/api/v1/sites/demo/calendar/exceptions/${holiday}`).expect(404);
  });

  it('el calendario guardado decide las horas de turno', async () => {
    const calendar = await app.get(CalendarService).calendar('demo');
    expect(calendar.empty).toBe(false);
    expect(calendar.versionOn(inDays(11))?.timeZone).toBe('Europe/Madrid');
    expect(calendar.versionOn(inDays(1))).toBeUndefined();
  });

  it('borra una versión futura con sus turnos', async () => {
    await http(admin)
      .delete(`/api/v1/sites/demo/calendar/versions/${inDays(10)}`)
      .expect(204);
    await http(admin)
      .delete(`/api/v1/sites/demo/calendar/versions/${inDays(10)}`)
      .expect(404);
    const view = (await http(viewer).get('/api/v1/sites/demo/calendar').expect(200))
      .body as CalendarView;
    expect(view.versions).toEqual([]);
  });
});
