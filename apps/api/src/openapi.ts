import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const OPENAPI_PATH = 'docs';

/** Publica la documentación OpenAPI en /docs y el documento en /docs/openapi.json. */
export function setupOpenApi(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('LogicFlows API')
      .setDescription('Estado, producción y alarmas de las células de paletizado.')
      .setVersion('0.1.0')
      .build(),
  );
  SwaggerModule.setup(OPENAPI_PATH, app, document, {
    jsonDocumentUrl: `${OPENAPI_PATH}/openapi.json`,
  });
}
