import { ApiResponse } from '@nestjs/swagger';
import { describe, expect, it } from 'vitest';
import {
  API_RESPONSE_METADATA,
  ApiResponseHeaders,
} from './api-response-headers.decorator';

const ETAG = { ETag: { description: 'Version.', schema: { type: 'string' } } };

describe('ApiResponseHeaders', () => {
  it('adds headers to an existing response and keeps its other fields', () => {
    class Controller {
      @ApiResponseHeaders(200, ETAG)
      @ApiResponse({ status: 200, description: 'Ok.', type: String })
      handle() {}
    }

    const responses = Reflect.getMetadata(
      API_RESPONSE_METADATA,
      Controller.prototype.handle,
    );

    expect(responses[200]).toMatchObject({
      description: 'Ok.',
      type: String,
      headers: ETAG,
    });
  });

  it('fails when the response is not declared', () => {
    expect(() => {
      class Controller {
        @ApiResponseHeaders(200, ETAG)
        handle() {}
      }
      return Controller;
    }).toThrow('no 200 response is declared');
  });
});
