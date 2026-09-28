import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['test/e2e/**/*.e2e.test.ts'],
    passWithNoTests: false,
    fileParallelism: false,
    globalSetup: [resolve(import.meta.dirname, './test/e2e/global-setup.ts')],
    setupFiles: [
      resolve(import.meta.dirname, './test/setup-env.ts'),
      resolve(import.meta.dirname, './test/e2e/setup.ts'),
    ],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      src: resolve(import.meta.dirname, './src'),
    },
  },
});
