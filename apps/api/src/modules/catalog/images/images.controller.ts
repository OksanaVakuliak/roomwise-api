import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import {
  type AuthenticatedAdmin,
  CurrentAdmin,
} from '../../auth/current-admin.decorator';
import { SESSION_COOKIE_NAME } from '../../auth/session-cookie';
import { type AdminImage, AdminImageDto } from './dto/admin-image.schema';
import { ImageUploadInterceptor } from './image-upload.interceptor';
import { IMAGE_FILE_FIELD_NAME } from './images.constants';
import { ImagesService } from './images.service';

@Controller('admin/images')
@ApiCookieAuth(SESSION_COOKIE_NAME)
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(ImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [IMAGE_FILE_FIELD_NAME],
      properties: {
        [IMAGE_FILE_FIELD_NAME]: { type: 'string', format: 'binary' },
      },
    },
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: AdminImageDto })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<AdminImage> {
    if (!file) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, {
        fields: [{ path: IMAGE_FILE_FIELD_NAME, code: 'REQUIRED' }],
      });
    }

    return this.imagesService.upload(file, admin.id);
  }
}
