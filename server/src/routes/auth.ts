import type { FastifyInstance, FastifyRequest } from 'fastify';
import { credentials, type AuthState } from '@shared/index.js';
import { parse } from '../lib/validate.js';
import { today } from '../lib/date.js';
import { badRequest } from '../lib/errors.js';
import {
  SESSION_COOKIE,
  changePassword,
  createUser,
  getUser,
  login,
  logout,
  needsSetup,
  validateSession,
} from '../services/auth.js';
import { changePassword as changePasswordSchema } from '@shared/index.js';

const COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

const serverTimezone = () =>
  process.env['TZ'] ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * The Secure flag follows the protocol the request actually arrived on, which
   * the proxy reports in X-Forwarded-Proto. Over https the cookie is marked
   * Secure; over plain http on a local network it is not, because a browser
   * silently drops a Secure cookie received that way and sign-in would loop.
   */
  const cookieOptions = (request: FastifyRequest) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: request.protocol === 'https',
    path: '/',
    signed: true,
    maxAge: COOKIE_MAX_AGE,
  });

  app.get('/auth/me', async (request): Promise<AuthState> => {
    const setupNeeded = await needsSetup(request.db);
    const clock = { serverDate: today(), timezone: serverTimezone() };
    if (setupNeeded) {
      return { authenticated: false, needsSetup: true, username: null, ...clock };
    }

    const raw = request.cookies[SESSION_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : null;
    const user = unsigned?.valid ? await validateSession(request.db, unsigned.value) : null;

    return {
      authenticated: user !== null,
      needsSetup: false,
      username: user?.username ?? null,
      ...clock,
    };
  });

  app.post(
    '/auth/setup',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      if (!(await needsSetup(request.db))) {
        throw badRequest('Пользователь уже создан');
      }
      const body = parse(credentials, request.body);
      const user = await createUser(request.db, body.username, body.password);
      const sessionId = await login(request.db, user.username, body.password);
      reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions(request));
      return {
        authenticated: true,
        needsSetup: false,
        username: user.username,
        serverDate: today(),
        timezone: serverTimezone(),
      };
    },
  );

  app.post(
    '/auth/login',
    {
      // The app faces the internet, so brute force against its single
      // account is throttled at the route level.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = parse(credentials, request.body);
      const sessionId = await login(request.db, body.username, body.password);
      reply.setCookie(SESSION_COOKIE, sessionId, cookieOptions(request));
      return {
        authenticated: true,
        needsSetup: false,
        username: body.username,
        serverDate: today(),
        timezone: serverTimezone(),
      };
    },
  );

  app.post('/auth/logout', async (request, reply) => {
    const raw = request.cookies[SESSION_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : null;
    if (unsigned?.valid) await logout(request.db, unsigned.value);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { authenticated: false };
  });

  app.post('/auth/password', async (request, reply) => {
    const body = parse(changePasswordSchema, request.body);
    await changePassword(request.db, body.currentPassword, body.newPassword);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/user', async (request) => {
    const user = await getUser(request.db);
    return { username: user?.username ?? null };
  });
}
