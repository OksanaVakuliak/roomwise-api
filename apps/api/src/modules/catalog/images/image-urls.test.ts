import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env';
import {
  CloudinaryUrlBuilder,
  ImageUrlBuilder,
  parseCloudinaryCloudName,
} from './image-urls';

const CLOUDINARY_URL = 'cloudinary://123456789012345:secret-key@my-cloud';

function createConfig(value: string): ConfigService<AppEnv, true> {
  return {
    get: vi.fn().mockReturnValue(value),
  } as unknown as ConfigService<AppEnv, true>;
}

describe('parseCloudinaryCloudName', () => {
  it('extracts the cloud name from a Cloudinary URL', () => {
    expect(parseCloudinaryCloudName(CLOUDINARY_URL)).toBe('my-cloud');
  });

  it('throws for a URL that is not parseable', () => {
    expect(() => parseCloudinaryCloudName('not-a-url')).toThrow(
      'Invalid Cloudinary URL',
    );
  });

  it('throws for a URL with the wrong protocol', () => {
    expect(() =>
      parseCloudinaryCloudName('https://123:secret@my-cloud'),
    ).toThrow('Invalid Cloudinary URL');
  });

  it('throws for a Cloudinary URL without a cloud name', () => {
    expect(() => parseCloudinaryCloudName('cloudinary://123:secret@')).toThrow(
      'Invalid Cloudinary URL',
    );
  });
});

describe('CloudinaryUrlBuilder', () => {
  const builder = new CloudinaryUrlBuilder('my-cloud');

  it('builds a thumb, card and zoom URL for an image', () => {
    const ref = builder.toImageRef({ id: 'image-1', publicId: 'oak-table' });

    expect(ref).toEqual({
      id: 'image-1',
      thumb:
        'https://res.cloudinary.com/my-cloud/image/upload/w_320,c_limit,f_auto,q_auto/oak-table',
      card: 'https://res.cloudinary.com/my-cloud/image/upload/w_640,c_limit,f_auto,q_auto/oak-table',
      zoom: 'https://res.cloudinary.com/my-cloud/image/upload/w_1600,c_limit,f_auto,q_auto/oak-table',
    });
  });

  it('builds a fixed-JPEG texture URL', () => {
    const ref = builder.toTextureRef({ id: 'image-2', publicId: 'oak-bark' });

    expect(ref).toEqual({
      id: 'image-2',
      url: 'https://res.cloudinary.com/my-cloud/image/upload/w_1024,h_1024,c_fill,f_jpg,q_auto/oak-bark',
    });
  });

  it('keeps folder slashes in the publicId as-is', () => {
    const ref = builder.toImageRef({
      id: 'image-3',
      publicId: 'roomwise/seed/oak',
    });

    expect(ref.thumb).toBe(
      'https://res.cloudinary.com/my-cloud/image/upload/w_320,c_limit,f_auto,q_auto/roomwise/seed/oak',
    );
  });
});

describe('ImageUrlBuilder', () => {
  it('reads the cloud name from CLOUDINARY_URL via ConfigService', () => {
    const builder = new ImageUrlBuilder(createConfig(CLOUDINARY_URL));

    const ref = builder.toImageRef({ id: 'image-1', publicId: 'oak-table' });

    expect(ref.card).toBe(
      'https://res.cloudinary.com/my-cloud/image/upload/w_640,c_limit,f_auto,q_auto/oak-table',
    );
  });

  it('produces a TextureRef with the texture variant URL', () => {
    const builder = new ImageUrlBuilder(createConfig(CLOUDINARY_URL));

    const ref = builder.toTextureRef({ id: 'image-2', publicId: 'oak-bark' });

    expect(ref).toEqual({
      id: 'image-2',
      url: 'https://res.cloudinary.com/my-cloud/image/upload/w_1024,h_1024,c_fill,f_jpg,q_auto/oak-bark',
    });
  });

  it('throws when CLOUDINARY_URL is invalid', () => {
    expect(() => new ImageUrlBuilder(createConfig('not-a-url'))).toThrow(
      'Invalid Cloudinary URL',
    );
  });
});
