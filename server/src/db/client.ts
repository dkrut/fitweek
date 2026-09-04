import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema.js';

export type Database = LibSQLDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  client: Client;
  close: () => void;
}

/** A file: URL for libsql. On Windows the path has to be normalised first. */
function toFileUrl(filePath: string): string {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return `file:${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

export async function createDb(dbPath: string): Promise<DbHandle> {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const client = createClient({ url: toFileUrl(dbPath) });

  // foreign_keys is required: cascading deletes of days and sets rely on it.
  await client.execute('PRAGMA foreign_keys = ON');
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA busy_timeout = 5000');
  await client.execute('PRAGMA synchronous = NORMAL');

  const db = drizzle(client, { schema });
  return { db, client, close: () => client.close() };
}

/**
 * A throwaway database for tests: a file in a temp directory, not ':memory:'.
 * libsql opens a separate connection for a transaction, and for in-memory that
 * turns out to be a different, empty database; a file has no such problem.
 */
export async function createTempDb(): Promise<DbHandle> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitweek-test-'));
  const dbPath = path.join(dir, 'test.db');
  const handle = await createDb(dbPath);
  return {
    ...handle,
    close: () => {
      handle.close();
      // Windows keeps WAL file handles for a while after close(): failing to
      // remove the directory is fine, it lives in the temp folder anyway.
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignored */
      }
    },
  };
}

/** The files of one WAL-mode database: skip -wal and you get a stale snapshot. */
const DB_FILE_SUFFIXES = ['', '-wal', '-shm'];

/**
 * A copy of an existing database in a temp directory, so tests and manual
 * checks run against real data without touching it.
 *
 * All three files are copied: the database runs in WAL mode, and recent writes
 * live in `app.db-wal` rather than `app.db`. Copying `app.db` alone yields a
 * nearly empty database and verifies something other than what actually runs.
 */
export async function createDbCopy(sourceDbPath: string): Promise<DbHandle> {
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`Файл базы не найден: ${sourceDbPath}`);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitweek-copy-'));
  const target = path.join(dir, 'app.db');
  for (const suffix of DB_FILE_SUFFIXES) {
    const from = `${sourceDbPath}${suffix}`;
    if (fs.existsSync(from)) fs.copyFileSync(from, `${target}${suffix}`);
  }

  const handle = await createDb(target);
  return {
    ...handle,
    close: () => {
      handle.close();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignored */
      }
    },
  };
}

export async function applyMigrations(db: Database, migrationsFolder: string): Promise<void> {
  await migrate(db, { migrationsFolder });
}
