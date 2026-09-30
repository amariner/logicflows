import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../app.module.ts';
import { setupOpenApi } from '../openapi.ts';

describe('API HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupOpenApi(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer() as Server);

  it.each(['/health/live', '/health/ready'])('%s responde que la API está sana', async (path) => {
    const response = await http().get(path).expect(200);
    expect(response.body).toMatchObject({ status: 'ok' });
  });

  it('publica el documento OpenAPI con los endpoints de salud', async () => {
    const response = await http().get('/docs/openapi.json').expect(200);
    const document = response.body as { info: { title: string }; paths: Record<string, unknown> };
    expect(document.info.title).toBe('LogicFlows API');
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/health/live', '/health/ready']),
    );
  });

  it('responde 404 a una ruta que no existe', async () => {
    await http().get('/no-existe').expect(404);
  });
});
