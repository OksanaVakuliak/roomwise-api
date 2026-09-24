import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { AppEnv } from '../../../config/env';
import { CLOUDINARY_UPLOAD_FOLDER } from './images.constants';

export interface CloudinaryUploadResult {
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function parseCloudinaryCredentials(
  cloudinaryUrl: string,
): CloudinaryCredentials {
  let parsed: URL;

  try {
    parsed = new URL(cloudinaryUrl);
  } catch {
    throw new Error('Invalid Cloudinary URL');
  }

  if (
    parsed.protocol !== 'cloudinary:' ||
    !parsed.hostname ||
    !parsed.username ||
    !parsed.password
  ) {
    throw new Error('Invalid Cloudinary URL');
  }

  return {
    cloudName: parsed.hostname,
    apiKey: decodeURIComponent(parsed.username),
    apiSecret: decodeURIComponent(parsed.password),
  };
}

@Injectable()
export class CloudinaryService {
  constructor(@Inject(ConfigService) config: ConfigService<AppEnv, true>) {
    const credentials = parseCloudinaryCredentials(
      config.get('CLOUDINARY_URL', { infer: true }),
    );

    cloudinary.config({
      cloud_name: credentials.cloudName,
      api_key: credentials.apiKey,
      api_secret: credentials.apiSecret,
      secure: true,
    });
  }

  upload(buffer: Buffer): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: CLOUDINARY_UPLOAD_FOLDER },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary upload returned no result'));
            return;
          }

          resolve({
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
          });
        },
      );

      stream.end(buffer);
    });
  }

  async destroy(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    await cloudinary.api.delete_resources_by_prefix(prefix);
  }
}
