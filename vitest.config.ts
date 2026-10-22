import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'tests/shared/**/*.test.ts',
            'tests/server/**/*.test.ts',
            'tests/styles/**/*.test.ts',
          ],
          setupFiles: ['tests/setup/node.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/client/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/dom.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/client/main.tsx', 'src/server/main.ts'],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: {
        lines: 85,
        branches: 80,
        'src/shared/**': { lines: 95 },
      },
    },
  },
});
