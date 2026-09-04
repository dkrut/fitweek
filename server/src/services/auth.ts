import { eq, lt } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import * as t from '../db/schema.js';
import { conflict, unauthorized } from '../lib/errors.js';
import { hashPassword, newSessionId, verifyPassword } from '../lib/password.js';

export const SESSION_COOKIE = 'fit_session';
const SESSION_DAYS = 90;

function expiryIso(days = SESSION_DAYS): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function getUser(db: Database) {
  const rows = await db.select().from(t.appUser).limit(1);
  return rows[0] ?? null;
}

export async function needsSetup(db: Database): Promise<boolean> {
  return (await getUser(db)) === null;
}

export async function createUser(db: Database, username: string, password: string) {
  if (await getUser(db)) throw conflict('Пользователь уже создан');
  const passwordHash = await hashPassword(password);
  await db.insert(t.appUser).values({ username, passwordHash });
  const user = await getUser(db);
  if (!user) throw new Error('Не удалось создать пользователя');
  return user;
}

/**
 * Creates the account from INIT_USERNAME/INIT_PASSWORD on first start.
 * Does nothing when a user already exists, so the variables can safely stay
 * in the compose file.
 */
export async function ensureInitialUser(
  db: Database,
  username: string | undefined,
  password: string | undefined,
): Promise<boolean> {
  if (!username || !password) return false;
  if (await getUser(db)) return false;
  if (password.length < 8) {
    throw new Error('INIT_PASSWORD должен быть не короче 8 символов');
  }
  await createUser(db, username, password);
  return true;
}

export async function login(db: Database, username: string, password: string): Promise<string> {
  const user = await getUser(db);
  // The hash is always verified, even when the username does not match:
  // otherwise the response time would reveal whether the user exists.
  const stored = user?.passwordHash ?? 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA';
  const passwordOk = await verifyPassword(password, stored);

  if (!user || user.username !== username || !passwordOk) {
    throw unauthorized('Неверный логин или пароль');
  }

  const id = newSessionId();
  await db.insert(t.session).values({ id, userId: user.id, expiresAt: expiryIso() });
  await db.delete(t.session).where(lt(t.session.expiresAt, new Date().toISOString()));
  return id;
}

export async function validateSession(db: Database, sessionId: string) {
  const rows = await db.select().from(t.session).where(eq(t.session.id, sessionId)).limit(1);
  const found = rows[0];
  if (!found) return null;
  if (found.expiresAt < new Date().toISOString()) {
    await db.delete(t.session).where(eq(t.session.id, sessionId));
    return null;
  }
  return getUser(db);
}

export async function logout(db: Database, sessionId: string): Promise<void> {
  await db.delete(t.session).where(eq(t.session.id, sessionId));
}

export async function changePassword(
  db: Database,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await getUser(db);
  if (!user) throw unauthorized();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw unauthorized('Текущий пароль неверен');
  }
  await db
    .update(t.appUser)
    .set({ passwordHash: await hashPassword(newPassword) })
    .where(eq(t.appUser.id, user.id));
  // Changing the password signs out every device, which is the expected result.
  await db.delete(t.session);
}
