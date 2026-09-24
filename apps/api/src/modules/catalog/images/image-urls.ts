import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../config/env';
import type { ImageRef, TextureRef } from '../public/dto/image-ref.schema';

export interface ImageSource {
  id: string;
  publicId: string;
}

const CLOUDINARY_TRANSFORMATIONS = {
  thumb: 'w_320,c_limit,f_auto,q_auto',
  card: 'w_640,c_limit,f_auto,q_auto',
  zoom: 'w_1600,c_limit,f_auto,q_auto',
  texture: 'w_1024,h_1024,c_fill,f_jpg,q_auto',
} as const;

export function parseCloudinaryCloudName(cloudinaryUrl: string): string {
  let parsed: URL;

  try {
    parsed = new URL(cloudinaryUrl);
  } catch {
    throw new Error(`Invalid Cloudinary URL: ${cloudinaryUrl}`);
  }

  if (parsed.protocol !== 'cloudinary:' || !parsed.hostname) {
    throw new Error(`Invalid Cloudinary URL: ${cloudinaryUrl}`);
  }

  return parsed.hostname;
}

export class CloudinaryUrlBuilder {
  constructor(private readonly cloudName: string) {}

  build(publicId: string, transformation: string): string {
    return `https://res.cloudinary.com/${this.cloudName}/image/upload/${transformation}/${publicId}`;
  }

  toImageRef({ id, publicId }: ImageSource): ImageRef {
    return {
      id,
      thumb: this.build(publicId, CLOUDINARY_TRANSFORMATIONS.thumb),
      card: this.build(publicId, CLOUDINARY_TRANSFORMATIONS.card),
      zoom: this.build(publicId, CLOUDINARY_TRANSFORMATIONS.zoom),
    };
  }

  toTextureRef({ id, publicId }: ImageSource): TextureRef {
    return {
      id,
      url: this.build(publicId, CLOUDINARY_TRANSFORMATIONS.texture),
    };
  }
}

@Injectable()
export class ImageUrlBuilder {
  private readonly builder: CloudinaryUrlBuilder;

  constructor(config: ConfigService<AppEnv, true>) {
    const cloudName = parseCloudinaryCloudName(
      config.get('CLOUDINARY_URL', { infer: true }),
    );
    this.builder = new CloudinaryUrlBuilder(cloudName);
  }

  toImageRef(source: ImageSource): ImageRef {
    return this.builder.toImageRef(source);
  }

  toTextureRef(source: ImageSource): TextureRef {
    return this.builder.toTextureRef(source);
  }
}
