import { describe, expect, it } from 'vitest';
import { findCloudinaryCloudName, parseCloudinaryUrl } from './cloudinary-url';

const CLOUDINARY_URL = 'cloudinary://123456789012345:secret-key@my-cloud';

describe('parseCloudinaryUrl', () => {
  it('extracts the cloud name, key and secret from a Cloudinary URL', () => {
    expect(parseCloudinaryUrl(CLOUDINARY_URL)).toEqual({
      cloudName: 'my-cloud',
      apiKey: '123456789012345',
      apiSecret: 'secret-key',
    });
  });

  it('decodes percent-encoded characters in the key and secret', () => {
    const url = 'cloudinary://a%2Fb:c%2Fd@my-cloud';

    expect(parseCloudinaryUrl(url)).toEqual({
      cloudName: 'my-cloud',
      apiKey: 'a/b',
      apiSecret: 'c/d',
    });
  });

  it('returns null for a URL that is not parseable', () => {
    expect(parseCloudinaryUrl('not-a-url')).toBeNull();
  });

  it('returns null for a URL with the wrong protocol', () => {
    expect(parseCloudinaryUrl('https://123:secret@my-cloud')).toBeNull();
  });

  it('returns null when the cloud name, key or secret is missing', () => {
    expect(parseCloudinaryUrl('cloudinary://123:secret@')).toBeNull();
    expect(parseCloudinaryUrl('cloudinary://:secret@my-cloud')).toBeNull();
    expect(parseCloudinaryUrl('cloudinary://123:@my-cloud')).toBeNull();
  });

  it('returns null instead of throwing for a malformed percent-escape', () => {
    expect(parseCloudinaryUrl('cloudinary://key:abc%zz@my-cloud')).toBeNull();
    expect(parseCloudinaryUrl('cloudinary://ab%zz:secret@my-cloud')).toBeNull();
  });
});

describe('findCloudinaryCloudName', () => {
  it('extracts the cloud name from a Cloudinary URL', () => {
    expect(findCloudinaryCloudName(CLOUDINARY_URL)).toBe('my-cloud');
  });

  it('returns null for a URL that is not parseable', () => {
    expect(findCloudinaryCloudName('not-a-url')).toBeNull();
  });

  it('returns null for a Cloudinary URL without a cloud name', () => {
    expect(findCloudinaryCloudName('cloudinary://123:secret@')).toBeNull();
  });
});
