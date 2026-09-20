import type { ArgumentMetadata } from '@nestjs/common';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

class ExampleDto extends createZodDto(z.object({ name: z.string().min(1) })) {}

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: ExampleDto,
};

describe('ZodValidationPipe', () => {
  it('accepts valid DTO input', () => {
    const pipe = new ZodValidationPipe();

    expect(pipe.transform({ name: 'Roomwise' }, metadata)).toEqual({
      name: 'Roomwise',
    });
  });

  it('rejects invalid DTO input', () => {
    const pipe = new ZodValidationPipe();

    expect(() => pipe.transform({ name: '' }, metadata)).toThrow();
  });
});
