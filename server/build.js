import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled into a single file. The @fitweek/shared package is wired through an
 * alias and therefore lands inside the bundle, so shared needs no build of its
 * own. Dependencies from node_modules stay external: some of them are native.
 */
await build({
  entryPoints: [path.join(here, 'src/index.ts')],
  outfile: path.join(here, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  alias: {
    '@shared': path.join(here, '../shared/src'),
  },
  banner: {
    // drizzle-orm and fastify call require() internally; ESM has to restore it.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);',
    ].join('\n'),
  },
});
