import {
  Controller,
  Get,
  HttpStatus,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createOpenApiDocument } from './openapi';

class SampleDto extends createZodDto(
  z.object({
    note: z.string().nullable(),
    quantity: z.number().nullable(),
    tags: z.array(z.string()),
    nested: z.object({ text: z.string().nullable() }),
  }),
) {}

@Controller('sample')
class SampleController {
  @Get()
  @ZodResponse({ status: HttpStatus.OK, type: SampleDto })
  get() {
    return { note: null, quantity: null, tags: [], nested: { text: null } };
  }
}

describe('createOpenApiDocument', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SampleController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function sampleProperties() {
    const schema = createOpenApiDocument(app).components?.schemas
      ?.SampleDto_Output as { properties: Record<string, unknown> };
    return schema.properties;
  }

  it('describes a top-level nullable string as string or null', () => {
    expect(sampleProperties().note).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
    });
  });

  it('describes a top-level nullable number as number or null', () => {
    expect(sampleProperties().quantity).toEqual({
      anyOf: [{ type: 'number' }, { type: 'null' }],
    });
  });

  it('keeps a string array as an array', () => {
    expect(sampleProperties().tags).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
  });

  it('describes a nested nullable string as string or null', () => {
    expect(sampleProperties().nested).toMatchObject({
      properties: {
        text: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
    });
  });
});
