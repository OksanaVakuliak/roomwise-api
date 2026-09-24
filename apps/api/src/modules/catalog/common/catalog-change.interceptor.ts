import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable, tap } from 'rxjs';
import { CatalogCache } from '../public/catalog-cache';

const CATALOG_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

@Injectable()
export class CatalogChangeInterceptor implements NestInterceptor {
  constructor(
    @Inject(CatalogCache) private readonly catalogCache: CatalogCache,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ method: string }>();

    if (!CATALOG_CHANGING_METHODS.has(request.method)) {
      return next.handle();
    }

    return next.handle().pipe(tap(() => this.catalogCache.invalidate()));
  }
}
