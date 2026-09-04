import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  DATA_DIR: z.string().default('./data'),
  /**
   * Signing secret for the session cookie. Required: with a random secret every
   * session would expire on each container restart.
   * Generate with: openssl rand -hex 32
   */
  SESSION_SECRET: z.string().min(16),
  INIT_USERNAME: z.string().optional(),
  INIT_PASSWORD: z.string().optional(),
  /** Directory with the built front end; served statically when set. */
  WEB_DIR: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Некорректные переменные окружения:\n${issues}`);
}

const raw = parsed.data;
const dataDir = path.resolve(process.cwd(), raw.DATA_DIR);

export const env = {
  ...raw,
  dataDir,
  dbPath: path.join(dataDir, 'app.db'),
};
