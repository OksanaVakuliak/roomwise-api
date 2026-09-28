import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import multer from 'multer';
import type { Observable } from 'rxjs';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import {
  IMAGE_FILE_FIELD_NAME,
  MAX_IMAGE_UPLOAD_BYTES,
} from './images.constants';

const singleImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
}).single(IMAGE_FILE_FIELD_NAME);

@Injectable()
export class ImageUploadInterceptor implements NestInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const httpContext = context.switchToHttp();

    await new Promise<void>((resolve, reject) => {
      singleImageUpload(
        httpContext.getRequest(),
        httpContext.getResponse(),
        (error: unknown) => {
          if (!error) {
            resolve();
            return;
          }

          if (
            error instanceof multer.MulterError &&
            error.code === 'LIMIT_FILE_SIZE'
          ) {
            reject(
              new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, {
                params: { maxBytes: MAX_IMAGE_UPLOAD_BYTES },
                cause: error,
              }),
            );
            return;
          }

          if (error instanceof multer.MulterError) {
            reject(
              new AppError(ERROR_CODES.VALIDATION_FAILED, {
                fields: [{ path: IMAGE_FILE_FIELD_NAME, code: error.code }],
                cause: error,
              }),
            );
            return;
          }

          reject(error);
        },
      );
    });

    return next.handle();
  }
}
