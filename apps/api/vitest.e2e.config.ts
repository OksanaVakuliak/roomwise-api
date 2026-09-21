import { resolve } from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: import.meta.dirname,
    include: ['test/e2e/**/*.e2e-spec.ts'],
    passWithNoTests: true,
    setupFiles: [resolve(import.meta.dirname, './test/setup-env.ts')],
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
