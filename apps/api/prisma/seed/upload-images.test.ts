import { describe, expect, it } from 'vitest';
import type { SeedImage } from '../../src/modules/catalog/dataset/catalog-dataset.schema';
import {
  diffUploadMetadata,
  partitionExistingLocalEntries,
  summarizeOutcomes,
} from './upload-images';

function buildImage(overrides: Partial<SeedImage> = {}): SeedImage {
  return {
    id: '92634cfe-86b2-4120-b7f9-166e27324266',
    publicId: 'roomwise/seed/some-image',
    source: 'https://example.com/image.jpg',
    width: 100,
    height: 100,
    bytes: 1000,
    format: 'jpg',
    ...overrides,
  };
}

describe('diffUploadMetadata', () => {
  it('returns no warnings when the resource matches the dataset', () => {
    const image = buildImage();

    expect(
      diffUploadMetadata(image, {
        width: image.width,
        height: image.height,
        bytes: image.bytes,
        format: image.format,
      }),
    ).toEqual([]);
  });

  it('reports every mismatched field', () => {
    const image = buildImage();

    const warnings = diffUploadMetadata(image, {
      width: 200,
      height: 200,
      bytes: 2000,
      format: 'png',
    });

    expect(warnings).toEqual([
      'width: expected 100, got 200',
      'height: expected 100, got 200',
      'bytes: expected 1000, got 2000',
      'format: expected jpg, got png',
    ]);
  });
});

describe('partitionExistingLocalEntries', () => {
  const baseDir = __dirname;

  it('keeps remote sources without touching the filesystem', () => {
    const entry = { key: 'remote', image: buildImage() };

    const { valid, invalid } = partitionExistingLocalEntries([entry], baseDir);

    expect(valid).toEqual([entry]);
    expect(invalid).toEqual([]);
  });

  it('keeps local sources that exist on disk', () => {
    const entry = {
      key: 'local',
      image: buildImage({ source: 'assets/bathtub.svg', format: 'svg' }),
    };

    const { valid, invalid } = partitionExistingLocalEntries([entry], baseDir);

    expect(valid).toEqual([entry]);
    expect(invalid).toEqual([]);
  });

  it('marks a missing local source as invalid', () => {
    const entry = {
      key: 'missing',
      image: buildImage({
        source: 'assets/does-not-exist.svg',
        format: 'svg',
      }),
    };

    const { valid, invalid } = partitionExistingLocalEntries([entry], baseDir);

    expect(valid).toEqual([]);
    expect(invalid).toEqual([
      {
        status: 'failed',
        key: 'missing',
        publicId: entry.image.publicId,
        message: expect.stringContaining('does-not-exist.svg'),
      },
    ]);
  });
});

describe('summarizeOutcomes', () => {
  it('collects metadata mismatches from both existing and uploaded outcomes', () => {
    const outcomes = summarizeOutcomes([
      {
        status: 'existing' as const,
        key: 'existing-mismatch',
        publicId: 'roomwise/seed/a',
        warnings: ['width: expected 100, got 200'],
      },
      {
        status: 'existing' as const,
        key: 'existing-ok',
        publicId: 'roomwise/seed/b',
        warnings: [],
      },
      {
        status: 'uploaded' as const,
        key: 'uploaded-mismatch',
        publicId: 'roomwise/seed/c',
        warnings: ['format: expected jpg, got png'],
      },
    ]);

    expect(outcomes.existing).toBe(2);
    expect(outcomes.uploaded).toBe(1);
    expect(outcomes.failed).toEqual([]);
    expect(outcomes.mismatched).toEqual([
      {
        key: 'existing-mismatch',
        publicId: 'roomwise/seed/a',
        warnings: ['width: expected 100, got 200'],
      },
      {
        key: 'uploaded-mismatch',
        publicId: 'roomwise/seed/c',
        warnings: ['format: expected jpg, got png'],
      },
    ]);
  });
});
