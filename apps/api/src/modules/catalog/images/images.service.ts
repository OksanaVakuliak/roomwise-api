import { Inject, Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer as detectFileType } from 'file-type';
import { AppError } from '../../../common/http/app-error';
import { ERROR_CODES } from '../../../common/http/error-codes';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CloudinaryService } from './cloudinary.service';
import type { AdminImage } from './dto/admin-image.schema';
import { ImageUrlBuilder } from './image-urls';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  type AllowedImageMimeType,
  MAX_IMAGE_UPLOAD_BYTES,
} from './images.constants';

interface CreatedImage {
  id: string;
  publicId: string;
  width: number;
  height: number;
}

function isAllowedImageMimeType(mime: string): mime is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CloudinaryService) private readonly cloudinary: CloudinaryService,
    @Inject(ImageUrlBuilder) private readonly imageUrls: ImageUrlBuilder,
  ) {}

  async upload(
    file: Express.Multer.File,
    createdById: string,
  ): Promise<AdminImage> {
    this.assertSize(file);
    await this.assertSignature(file);

    const uploaded = await this.uploadToCloudinary(file.buffer);

    let image: CreatedImage;
    try {
      image = await this.prisma.image.create({
        data: {
          publicId: uploaded.publicId,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          format: uploaded.format,
          createdById,
        },
      });
    } catch (error) {
      await this.destroyBestEffort(uploaded.publicId);
      throw error;
    }

    return this.toResponse(image);
  }

  private assertSize(file: Express.Multer.File): void {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new AppError(ERROR_CODES.PAYLOAD_TOO_LARGE, {
        params: { maxBytes: MAX_IMAGE_UPLOAD_BYTES },
      });
    }
  }

  private async assertSignature(file: Express.Multer.File): Promise<void> {
    const detected = await detectFileType(file.buffer);

    if (!detected || !isAllowedImageMimeType(detected.mime)) {
      throw new AppError(ERROR_CODES.UNSUPPORTED_IMAGE_TYPE, {
        params: { allowed: ALLOWED_IMAGE_MIME_TYPES },
      });
    }
  }

  private async uploadToCloudinary(buffer: Buffer) {
    try {
      return await this.cloudinary.upload(buffer);
    } catch (error) {
      throw new AppError(ERROR_CODES.IMAGE_STORAGE_FAILED, { cause: error });
    }
  }

  private async destroyBestEffort(publicId: string): Promise<void> {
    try {
      await this.cloudinary.destroy(publicId);
    } catch (cleanupError) {
      this.logger.error(
        `Failed to clean up orphaned Cloudinary asset ${publicId} after a database failure`,
        cleanupError instanceof Error ? cleanupError.stack : undefined,
      );
    }
  }

  private toResponse(image: CreatedImage): AdminImage {
    const imageRef = this.imageUrls.toImageRef(image);
    const textureRef = this.imageUrls.toTextureRef(image);

    return {
      id: imageRef.id,
      thumb: imageRef.thumb,
      card: imageRef.card,
      zoom: imageRef.zoom,
      texture: textureRef.url,
      width: image.width,
      height: image.height,
    };
  }
}
