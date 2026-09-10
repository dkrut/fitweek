import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * The version shown in the app is the one in package.json, read at build time.
 * A second copy in the source would drift from it the first time nobody
 * remembers to bump both.
 */
const { version } = JSON.parse(
  readFileSync(path.resolve(here, '../package.json'), 'utf8'),
) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': path.resolve(here, '../shared/src'), '@': path.resolve(here, 'src') },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // A separate React chunk: it changes far less often than our own code,
        // so the browser does not refetch it after every edited screen.
        // From vite 8 on, rolldown does the bundling and groups are declared
        // through codeSplitting; the object form of manualChunks is gone.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /[\/]node_modules[\/](react|react-dom|react-router|react-router-dom)[\/]/,
            },
          ],
        },
      },
    },
  },
});
