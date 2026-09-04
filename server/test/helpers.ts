import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  applyMigrations,
  createDbCopy,
  createTempDb,
  type Database,
  type DbHandle,
} from '../src/db/client.js';
import { appUser } from '../src/db/schema.js';
import { hashPassword } from '../src/lib/password.js';
import { buildApp } from '../src/app.js';
import { insertFixture, type Fixture } from './fixtures.js';
import { readSettings } from '../src/routes/settings.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../drizzle');

export interface TestContext {
  app: FastifyInstance;
  db: Database;
  handle: DbHandle;
  cookie: string;
  /** Ids of the inserted data; null when the context was created empty. */
  fixture: Fixture | null;
  close: () => Promise<void>;
}

const USERNAME = 'tester';
const PASSWORD = 'test-password-123';

export async function createTestContext(options: { data?: boolean } = {}): Promise<TestContext> {
  const handle = await createTempDb();
  await applyMigrations(handle.db, migrationsFolder);
  await readSettings(handle.db);
  const fixture = options.data === false ? null : await insertFixture(handle.db);

  const app = await buildApp({
    db: handle.db,
    sessionSecret: 'test-secret-that-is-long-enough-0123456789',
    logger: false,
  });
  await app.ready();

  const setup = await app.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username: USERNAME, password: PASSWORD },
  });
  if (setup.statusCode !== 200) {
    throw new Error(`Не удалось создать пользователя: ${setup.statusCode} ${setup.body}`);
  }
  const cookie = extractCookie(setup.headers['set-cookie']);

  return {
    app,
    db: handle.db,
    handle,
    cookie,
    fixture,
    close: async () => {
      await app.close();
      handle.close();
    },
  };
}

/* --------------------------- Checks on live data -------------------------- */

/**
 * A snapshot of the working database, placed here by `scripts/copy-live-db.sh`.
 * The path can be overridden with the LIVE_DB variable.
 */
export function liveDbPath(): string {
  return process.env.LIVE_DB ?? path.resolve(here, '../../.tmp/live-db/app.db');
}

export function hasLiveDb(): boolean {
  return fs.existsSync(liveDbPath());
}

/**
 * A context on a copy of the working database, so migrations are checked
 * against real data rather than a tidy fixture that never has empty templates
 * or old days with half the fields filled in.
 *
 * The password in the copy is replaced with a test one: the real hash is
 * unknown to us and should stay that way, yet signing in is required. The copy
 * is disposable and lives in a temp directory.
 */
export async function createLiveContext(): Promise<TestContext> {
  const handle = await createDbCopy(liveDbPath());
  await applyMigrations(handle.db, migrationsFolder);
  await readSettings(handle.db);

  const users = await handle.db.select().from(appUser);
  const user = users[0];
  if (!user) throw new Error('В копии базы нет пользователя — снимок снят не с рабочей базы?');
  await handle.db
    .update(appUser)
    .set({ passwordHash: await hashPassword(PASSWORD) })
    .where(eq(appUser.id, user.id));

  const app = await buildApp({
    db: handle.db,
    sessionSecret: 'test-secret-that-is-long-enough-0123456789',
    logger: false,
  });
  await app.ready();

  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: user.username, password: PASSWORD },
  });
  if (login.statusCode !== 200) {
    throw new Error(`Не удалось войти в копию базы: ${login.statusCode} ${login.body}`);
  }

  return {
    app,
    db: handle.db,
    handle,
    cookie: extractCookie(login.headers['set-cookie']),
    fixture: null,
    close: async () => {
      await app.close();
      handle.close();
    },
  };
}

function extractCookie(header: string | string[] | undefined): string {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) throw new Error('Сервер не выставил сессионную куку');
  return raw.split(';')[0] ?? '';
}

export const credentials = { username: USERNAME, password: PASSWORD };
export { extractCookie };
