import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
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
