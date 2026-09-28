import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { ErrorResponseDto } from '../../../common/http/error-response.dto';
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
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'UNAUTHENTICATED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    description: 'PAYLOAD_TOO_LARGE',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    description: 'UNSUPPORTED_IMAGE_TYPE',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'IMAGE_STORAGE_FAILED',
    type: ErrorResponseDto,
  })
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
