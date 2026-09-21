import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOpenApiDocument } from '../src/common/openapi/openapi';
import { createApplication } from '../src/main';

const OPENAPI_PATH = resolve(process.cwd(), 'openapi.json');

async function generateOpenApi(): Promise<void> {
  const app = await createApplication();

  try {
    const document = createOpenApiDocument(app);
    const output = `${JSON.stringify(document, null, 2)}\n`;

    if (process.argv.includes('--check')) {
      const current = await readFile(OPENAPI_PATH, 'utf8').catch(() => '');

      if (current !== output) {
        throw new Error(
          'apps/api/openapi.json is outdated. Run pnpm --filter api openapi:generate.',
        );
      }

      return;
    }

    await writeFile(OPENAPI_PATH, output, 'utf8');
  } finally {
    await app.close();
  }
}

generateOpenApi().catch((error) => {
  const message = error instanceof Error ? error.message : 'OpenAPI failed.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
