import type { HeadersObject } from '@nestjs/swagger';

export const API_RESPONSE_METADATA = 'swagger/apiResponse';

type ResponsesMetadata = Record<string, { headers?: HeadersObject }>;

export function ApiResponseHeaders(
  status: number,
  headers: HeadersObject,
): MethodDecorator {
  return (_target, _key, descriptor) => {
    const handler = descriptor.value as object;
    const responses: ResponsesMetadata =
      Reflect.getMetadata(API_RESPONSE_METADATA, handler) ?? {};
    const response = responses[status];

    if (!response) {
      throw new Error(`ApiResponseHeaders: no ${status} response is declared`);
    }

    Reflect.defineMetadata(
      API_RESPONSE_METADATA,
      {
        ...responses,
        [status]: { ...response, headers: { ...response.headers, ...headers } },
      },
      handler,
    );
    return descriptor;
  };
}
