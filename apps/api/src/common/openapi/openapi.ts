import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Roomwise API')
    .setDescription('API for the Roomwise renovation cost configurator')
    .setVersion('1.0')
    .setOpenAPIVersion('3.1.0')
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config), {
    version: '3.1',
  });
}

export function setupOpenApi(app: INestApplication): void {
  SwaggerModule.setup('api/docs', app, createOpenApiDocument(app));
}
