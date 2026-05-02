import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    root: __dirname,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
