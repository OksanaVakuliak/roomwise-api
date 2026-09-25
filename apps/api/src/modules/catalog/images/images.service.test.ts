import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../common/http/error-codes';
import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { CloudinaryService } from './cloudinary.service';
import type { ImageUrlBuilder } from './image-urls';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
} from './images.constants';
import { ImagesService } from './images.service';

const ADMIN_ID = 'admin-1';
const IMAGE_ID = 'image-1';
const PUBLIC_ID = 'roomwise/uploads/abc123';
const UPLOADED_WIDTH = 1600;
const UPLOADED_HEIGHT = 1200;

const PNG_FILE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0,
]);

const PDF_FILE = Buffer.from('%PDF-1.4 this is not an image at all');

function multerFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'upload.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: PNG_FILE.length,
    buffer: PNG_FILE,
    stream: Readable.from(Buffer.alloc(0)),
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function createCloudinary(
  overrides: Partial<Record<keyof CloudinaryService, unknown>> = {},
): CloudinaryService {
  return {
    upload: vi.fn().mockResolvedValue({
      publicId: PUBLIC_ID,
      width: UPLOADED_WIDTH,
      height: UPLOADED_HEIGHT,
      format: 'png',
      bytes: PNG_FILE.length,
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
    deleteByPrefix: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CloudinaryService;
}

function createPrisma(
  image: Partial<Record<'create', unknown>> = {},
): PrismaService {
  return {
    image: {
      create: vi.fn().mockResolvedValue({
        id: IMAGE_ID,
        publicId: PUBLIC_ID,
        width: UPLOADED_WIDTH,
        height: UPLOADED_HEIGHT,
      }),
      ...image,
    },
  } as unknown as PrismaService;
}

function createImageUrls(): ImageUrlBuilder {
  return {
    toImageRef: vi.fn(({ id, publicId }) => ({
      id,
      thumb: `https://cdn.test/thumb/${publicId}`,
      card: `https://cdn.test/card/${publicId}`,
      zoom: `https://cdn.test/zoom/${publicId}`,
    })),
    toTextureRef: vi.fn(({ id, publicId }) => ({
      id,
      url: `https://cdn.test/texture/${publicId}`,
    })),
  } as unknown as ImageUrlBuilder;
}

describe('ImagesService', () => {
  it('uploads the file, stores the Image row and returns computed URLs', async () => {
    const cloudinary = createCloudinary();
    const prisma = createPrisma();
    const service = new ImagesService(prisma, cloudinary, createImageUrls());

    const result = await service.upload(multerFile(), ADMIN_ID);

    expect(cloudinary.upload).toHaveBeenCalledWith(PNG_FILE);
    expect(prisma.image.create).toHaveBeenCalledWith({
      data: {
        publicId: PUBLIC_ID,
        width: UPLOADED_WIDTH,
        height: UPLOADED_HEIGHT,
        bytes: PNG_FILE.length,
        format: 'png',
        createdById: ADMIN_ID,
      },
    });
    expect(result).toEqual({
      id: IMAGE_ID,
      thumb: `https://cdn.test/thumb/${PUBLIC_ID}`,
      card: `https://cdn.test/card/${PUBLIC_ID}`,
      zoom: `https://cdn.test/zoom/${PUBLIC_ID}`,
      texture: `https://cdn.test/texture/${PUBLIC_ID}`,
      width: UPLOADED_WIDTH,
      height: UPLOADED_HEIGHT,
    });
  });

  it('rejects a file over the size limit before touching Cloudinary', async () => {
    const cloudinary = createCloudinary();
    const service = new ImagesService(
      createPrisma(),
      cloudinary,
      createImageUrls(),
    );

    await expect(
      service.upload(
        multerFile({ size: MAX_IMAGE_UPLOAD_BYTES + 1 }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PAYLOAD_TOO_LARGE,
      params: { maxBytes: MAX_IMAGE_UPLOAD_BYTES },
    });
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });

  it('rejects a file whose signature is not an allowed image type', async () => {
    const cloudinary = createCloudinary();
    const service = new ImagesService(
      createPrisma(),
      cloudinary,
      createImageUrls(),
    );

    await expect(
      service.upload(
        multerFile({
          buffer: PDF_FILE,
          size: PDF_FILE.length,
          mimetype: 'image/png',
          originalname: 'upload.pdf',
        }),
        ADMIN_ID,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.UNSUPPORTED_IMAGE_TYPE,
      params: { allowed: ALLOWED_IMAGE_MIME_TYPES },
    });
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });

  it('maps a Cloudinary failure to 502 and creates no Image row', async () => {
    const cloudinary = createCloudinary({
      upload: vi.fn().mockRejectedValue(new Error('Cloudinary is down')),
    });
    const prisma = createPrisma();
    const service = new ImagesService(prisma, cloudinary, createImageUrls());

    await expect(service.upload(multerFile(), ADMIN_ID)).rejects.toMatchObject({
      code: ERROR_CODES.IMAGE_STORAGE_FAILED,
    });
    expect(prisma.image.create).not.toHaveBeenCalled();
  });

  it('destroys the uploaded asset when the database insert fails', async () => {
    const dbError = new Error('unique constraint violation');
    const cloudinary = createCloudinary();
    const prisma = createPrisma({ create: vi.fn().mockRejectedValue(dbError) });
    const service = new ImagesService(prisma, cloudinary, createImageUrls());

    await expect(service.upload(multerFile(), ADMIN_ID)).rejects.toThrow(
      dbError,
    );
    expect(cloudinary.destroy).toHaveBeenCalledWith(PUBLIC_ID);
  });
});
