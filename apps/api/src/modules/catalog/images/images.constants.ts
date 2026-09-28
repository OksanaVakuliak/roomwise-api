export const MAX_IMAGE_UPLOAD_BYTES = 5_242_880;

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const CLOUDINARY_UPLOAD_FOLDER = 'roomwise/uploads';

export const IMAGE_FILE_FIELD_NAME = 'file';
