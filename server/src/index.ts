import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations, createDb } from './db/client.js';
import { env } from './lib/env.js';
import { buildApp } from './app.js';
import { ensureInitialUser } from './services/auth.js';
import { readSettings } from './routes/settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Both from src/ and from the built dist/, migrations sit next to the package. */
const migrationsFolder = path.resolve(here, '../drizzle');
/**
 * The built front end: inside the image it sits next to the server in `public`,
 * while a local run leaves it wherever vite put it. There is deliberately no
 * separate dev server — the app starts the same way locally and in a container,
 * and for debugging it is enough to point DATA_DIR at a copy of the database.
 */
const webDir = env.WEB_DIR
  ? path.resolve(env.WEB_DIR)
  : [path.resolve(here, '../public'), path.resolve(here, '../../web/dist')].find((dir) =>
      fs.existsSync(dir),
    ) ?? path.resolve(here, '../public');

async function main(): Promise<void> {
  const { db, close } = await createDb(env.dbPath);
  await applyMigrations(db, migrationsFolder);
  await readSettings(db);

  const created = await ensureInitialUser(db, env.INIT_USERNAME, env.INIT_PASSWORD);

  const app = await buildApp({
    db,
    sessionSecret: env.SESSION_SECRET,
    webDir,
    logger: true,
  });

  if (created) {
    app.log.info(`Создан пользователь «${env.INIT_USERNAME}» из переменных окружения`);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Получен ${signal}, останавливаюсь`);
    await app.close();
    close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`База данных: ${env.dbPath}`);
}

main().catch((error: unknown) => {
  console.error('Не удалось запустить сервер:', error);
  process.exit(1);
});
