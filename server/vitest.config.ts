import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@shared': path.resolve(here, '../shared/src') },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Pins the calendar: the fixture plans a different day for every weekday.
    setupFiles: ['./test/setup.ts'],
    // The tests share one migrations folder and the system idea of today;
    // parallel files do not clash, but a sequential run reads better.
    fileParallelism: false,
  },
});
