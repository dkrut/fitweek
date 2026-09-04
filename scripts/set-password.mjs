/**
 * Changes the user's password in a database. Needed for a verification copy:
 * the real hash is unknown to us, yet signing in is required. Runs inside the
 * container, where both @libsql/client and the database live.
 *
 *   node set-password.mjs <password> [path to database]
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@libsql/client';

const scryptAsync = promisify(scrypt);
const PARAMS = { N: 32768, r: 8, p: 1, keylen: 64 };

const [password, dbPath = '/data/app.db'] = process.argv.slice(2);
if (!password) {
  console.error('Pass the password as the first argument');
  process.exit(1);
}

const salt = randomBytes(16);
const derived = await scryptAsync(password.normalize('NFKC'), salt, PARAMS.keylen, {
  ...PARAMS,
  maxmem: 128 * PARAMS.N * PARAMS.r * 2,
});
const hash = [
  'scrypt',
  PARAMS.N,
  PARAMS.r,
  PARAMS.p,
  salt.toString('base64'),
  derived.toString('base64'),
].join('$');

const client = createClient({ url: `file:${dbPath}` });
const { rows } = await client.execute('SELECT id, username FROM app_user ORDER BY id LIMIT 1');
if (rows.length === 0) {
  console.error('The database holds no user');
  process.exit(1);
}
await client.execute({
  sql: 'UPDATE app_user SET password_hash = ? WHERE id = ?',
  args: [hash, rows[0].id],
});
await client.execute('DELETE FROM session');
client.close();
console.log(`Password of user ${rows[0].username} replaced`);
