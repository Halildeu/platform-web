import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/teams/panel/',
  plugins: [react()],
  build: {
    rollupOptions: { input: {
      panel: fileURLToPath(new URL('./index.html', import.meta.url)),
      login: fileURLToPath(new URL('./login.html', import.meta.url)),
    } },
  },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'jsdom', restoreMocks: true },
});
