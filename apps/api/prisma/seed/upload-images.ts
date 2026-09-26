import 'dotenv/config';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { parseCloudinaryUrl } from '../../src/config/cloudinary-url';
import {
  type SeedImage,
  seedImageSchema,
} from '../../src/modules/catalog/dataset/catalog-dataset.schema';
import { seedImages } from '../../src/modules/catalog/dataset/data/images';

const EXIT_FAILURE = 1;
const UPLOAD_CONCURRENCY = 4;
const RESOURCE_TYPE = 'image';
const NOT_FOUND_HTTP_CODE = 404;

interface SeedImageEntry {
  key: string;
  image: SeedImage;
}

interface UploadedOutcome {
  status: 'uploaded';
  key: string;
  publicId: string;
  warnings: string[];
}

interface ExistingOutcome {
  status: 'existing';
  key: string;
  publicId: string;
  warnings: string[];
}

interface FailedOutcome {
  status: 'failed';
  key: string;
  publicId: string;
  message: string;
}

type UploadOutcome = UploadedOutcome | ExistingOutcome | FailedOutcome;

type ResourceMetadata = Pick<
  UploadApiResponse,
  'width' | 'height' | 'bytes' | 'format'
>;

export function isRemoteSource(source: string): boolean {
  return source.startsWith('https://');
}

export function resolveUploadSource(source: string, baseDir: string): string {
  return isRemoteSource(source) ? source : resolve(baseDir, source);
}

export function buildUploadOptions(publicId: string): UploadApiOptions {
  return {
    public_id: publicId,
    resource_type: RESOURCE_TYPE,
    overwrite: false,
    unique_filename: false,
    use_filename: false,
  };
}

export function diffUploadMetadata(
  image: SeedImage,
  result: ResourceMetadata,
): string[] {
  const warnings: string[] = [];
  if (result.width !== image.width) {
    warnings.push(`width: expected ${image.width}, got ${result.width}`);
  }
  if (result.height !== image.height) {
    warnings.push(`height: expected ${image.height}, got ${result.height}`);
  }
  if (result.bytes !== image.bytes) {
    warnings.push(`bytes: expected ${image.bytes}, got ${result.bytes}`);
  }
  if (result.format !== image.format) {
    warnings.push(`format: expected ${image.format}, got ${result.format}`);
  }
  return warnings;
}

export interface MetadataMismatch {
  key: string;
  publicId: string;
  warnings: string[];
}

export function summarizeOutcomes(outcomes: UploadOutcome[]): {
  uploaded: number;
  existing: number;
  failed: FailedOutcome[];
  mismatched: MetadataMismatch[];
} {
  const failed: FailedOutcome[] = [];
  const mismatched: MetadataMismatch[] = [];
  let uploaded = 0;
  let existing = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'uploaded') {
      uploaded += 1;
      if (outcome.warnings.length > 0) {
        mismatched.push({
          key: outcome.key,
          publicId: outcome.publicId,
          warnings: outcome.warnings,
        });
      }
    } else if (outcome.status === 'existing') {
      existing += 1;
      if (outcome.warnings.length > 0) {
        mismatched.push({
          key: outcome.key,
          publicId: outcome.publicId,
          warnings: outcome.warnings,
        });
      }
    } else {
      failed.push(outcome);
    }
  }
  return { uploaded, existing, failed, mismatched };
}

function loadEntries(): SeedImageEntry[] {
  return Object.entries(seedImages).map(([key, image]) => ({ key, image }));
}

export function partitionValidEntries(entries: SeedImageEntry[]): {
  valid: SeedImageEntry[];
  invalid: FailedOutcome[];
} {
  const valid: SeedImageEntry[] = [];
  const invalid: FailedOutcome[] = [];
  for (const entry of entries) {
    const result = seedImageSchema.safeParse(entry.image);
    if (result.success) {
      valid.push(entry);
    } else {
      invalid.push({
        status: 'failed',
        key: entry.key,
        publicId: entry.image.publicId,
        message: result.error.issues.map((issue) => issue.message).join('; '),
      });
    }
  }
  return { valid, invalid };
}

export function partitionExistingLocalEntries(
  entries: SeedImageEntry[],
  baseDir: string,
): { valid: SeedImageEntry[]; invalid: FailedOutcome[] } {
  const valid: SeedImageEntry[] = [];
  const invalid: FailedOutcome[] = [];
  for (const entry of entries) {
    const source = resolveUploadSource(entry.image.source, baseDir);
    if (!isRemoteSource(entry.image.source) && !existsSync(source)) {
      invalid.push({
        status: 'failed',
        key: entry.key,
        publicId: entry.image.publicId,
        message: `Local asset not found: ${source}`,
      });
      continue;
    }
    valid.push(entry);
  }
  return { valid, invalid };
}

function extractHttpCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const direct = (error as { http_code?: unknown }).http_code;
  if (typeof direct === 'number') return direct;
  const nested = (error as { error?: { http_code?: unknown } }).error;
  if (nested && typeof nested.http_code === 'number') return nested.http_code;
  return undefined;
}

function extractErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const direct = (error as { message?: unknown }).message;
    if (typeof direct === 'string') return direct;
    const nested = (error as { error?: { message?: unknown } }).error;
    if (nested && typeof nested.message === 'string') return nested.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

async function findExistingResource(
  publicId: string,
): Promise<ResourceMetadata | undefined> {
  try {
    return await cloudinary.api.resource(publicId, {
      resource_type: RESOURCE_TYPE,
    });
  } catch (error) {
    if (extractHttpCode(error) === NOT_FOUND_HTTP_CODE) return undefined;
    throw error;
  }
}

async function uploadEntry(
  entry: SeedImageEntry,
  baseDir: string,
): Promise<UploadOutcome> {
  const { key, image } = entry;
  const source = resolveUploadSource(image.source, baseDir);

  if (!isRemoteSource(image.source) && !existsSync(source)) {
    return {
      status: 'failed',
      key,
      publicId: image.publicId,
      message: `Local asset not found: ${source}`,
    };
  }

  try {
    const existingResource = await findExistingResource(image.publicId);
    if (existingResource) {
      const warnings = diffUploadMetadata(image, existingResource);
      return { status: 'existing', key, publicId: image.publicId, warnings };
    }

    const result = await cloudinary.uploader.upload(
      source,
      buildUploadOptions(image.publicId),
    );
    const warnings = diffUploadMetadata(image, result);
    return { status: 'uploaded', key, publicId: image.publicId, warnings };
  } catch (error) {
    return {
      status: 'failed',
      key,
      publicId: image.publicId,
      message: extractErrorMessage(error),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function processNext(): Promise<void> {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) return;
    results[index] = await worker(items[index]);
    return processNext();
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => processNext()));
  return results;
}

function configureCloudinary(): void {
  const url = process.env.CLOUDINARY_URL;
  if (!url) {
    process.stderr.write('Missing CLOUDINARY_URL environment variable.\n');
    process.exit(EXIT_FAILURE);
  }

  const credentials = parseCloudinaryUrl(url);
  if (!credentials) {
    process.stderr.write('Invalid CLOUDINARY_URL environment variable.\n');
    process.exit(EXIT_FAILURE);
  }

  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });
}

function printSummary(summary: ReturnType<typeof summarizeOutcomes>): void {
  const { uploaded, existing, failed, mismatched } = summary;
  process.stdout.write(
    `Uploaded: ${uploaded}, already existed: ${existing}, failed: ${failed.length}, metadata mismatches: ${mismatched.length}\n`,
  );
  for (const failure of failed) {
    process.stderr.write(
      `  FAILED ${failure.key} (${failure.publicId}): ${failure.message}\n`,
    );
  }
  for (const mismatch of mismatched) {
    for (const warning of mismatch.warnings) {
      process.stderr.write(`  MISMATCH ${mismatch.key}: ${warning}\n`);
    }
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const baseDir = __dirname;
  const entries = loadEntries();
  const { valid, invalid } = partitionValidEntries(entries);

  if (dryRun) {
    const { valid: existingLocal, invalid: missingLocal } =
      partitionExistingLocalEntries(valid, baseDir);
    for (const entry of existingLocal) {
      const source = resolveUploadSource(entry.image.source, baseDir);
      process.stdout.write(
        `Would upload ${entry.key} -> ${entry.image.publicId} (${source})\n`,
      );
    }
    const allInvalid = [...invalid, ...missingLocal];
    for (const failure of allInvalid) {
      process.stderr.write(
        `  INVALID ${failure.key} (${failure.publicId}): ${failure.message}\n`,
      );
    }
    process.stdout.write(
      `Dry run: ${existingLocal.length} would upload, ${allInvalid.length} invalid\n`,
    );
    process.exitCode = allInvalid.length > 0 ? EXIT_FAILURE : 0;
    return;
  }

  configureCloudinary();

  const uploaded = await runWithConcurrency(
    valid,
    UPLOAD_CONCURRENCY,
    (entry) => uploadEntry(entry, baseDir),
  );
  const outcomes: UploadOutcome[] = [...uploaded, ...invalid];
  const summary = summarizeOutcomes(outcomes);

  printSummary(summary);
  process.exitCode =
    summary.failed.length > 0 || summary.mismatched.length > 0
      ? EXIT_FAILURE
      : 0;
}

if (require.main === module) {
  main().catch((error) => {
    const details = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Failed to upload seed images.\n${details}\n`);
    process.exitCode = EXIT_FAILURE;
  });
}
