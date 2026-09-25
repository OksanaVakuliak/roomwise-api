import type { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../../../config/env';
import { CloudinaryService } from './cloudinary.service';

vi.mock('cloudinary', () => ({
  v2: {
    config: vi.fn(),
    uploader: { upload_stream: vi.fn(), destroy: vi.fn() },
    api: { delete_resources_by_prefix: vi.fn() },
  },
}));

const CLOUDINARY_URL = 'cloudinary://123456789012345:secret-key@my-cloud';

function createConfig(value: string): ConfigService<AppEnv, true> {
  return {
    get: vi.fn().mockReturnValue(value),
  } as unknown as ConfigService<AppEnv, true>;
}

describe('CloudinaryService', () => {
  it('configures the Cloudinary SDK from CLOUDINARY_URL', () => {
    new CloudinaryService(createConfig(CLOUDINARY_URL));

    expect(cloudinary.config).toHaveBeenCalledWith({
      cloud_name: 'my-cloud',
      api_key: '123456789012345',
      api_secret: 'secret-key',
      secure: true,
    });
  });

  it('throws for an invalid CLOUDINARY_URL', () => {
    expect(() => new CloudinaryService(createConfig('not-a-url'))).toThrow(
      'Invalid Cloudinary URL',
    );
  });

  it('never includes the CLOUDINARY_URL secret in the thrown message', () => {
    let caught: Error | undefined;

    try {
      new CloudinaryService(
        createConfig(CLOUDINARY_URL.replace('cloudinary:', 'https:')),
      );
    } catch (error) {
      caught = error as Error;
    }

    expect(caught?.message).toBe('Invalid Cloudinary URL');
    expect(caught?.message).not.toContain('secret-key');
  });
});
