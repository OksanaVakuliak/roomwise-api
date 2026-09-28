import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/api'],
    passWithNoTests: true,
  },
});
