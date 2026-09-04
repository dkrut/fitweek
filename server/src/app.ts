import fs from 'node:fs';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { Database } from './db/client.js';
import { AppError } from './lib/errors.js';
import { SESSION_COOKIE, validateSession } from './services/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerDayRoutes } from './routes/days.js';
import { registerPlanRoutes } from './routes/plans.js';
import { registerMeasurementRoutes } from './routes/measurements.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerBackupRoutes } from './routes/backup.js';

declare module 'fastify' {
  interface FastifyRequest {
    db: Database;
    userId: number | null;
  }
}

export interface BuildAppOptions {
  db: Database;
  sessionSecret: string;
  webDir?: string | undefined;
  logger?: boolean;
}

/** Paths reachable without a session. Everything else under /api needs auth. */
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/me',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/setup',
]);

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 10 * 1024 * 1024, // импорт бэкапа может быть крупным
    // The app always sits behind the reverse proxy from docker-compose, so the
    // real client address and protocol come from its headers: login attempts
    // are counted per address, and the session cookie is marked Secure only
    // when the request really arrived over https.
    trustProxy: true,
  });

  await app.register(helmet, {
    // The front end is an SPA with inline styles from the Tailwind runtime;
    // a strict CSP is configured separately when exposing it publicly.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(cookie, { secret: options.sessionSecret });

  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
  });

  app.decorateRequest('db', null as unknown as Database);
  app.decorateRequest('userId', null);

  app.addHook('onRequest', async (request) => {
    request.db = options.db;
  });

  app.addHook('preHandler', async (request, reply) => {
    const url = request.url.split('?')[0] ?? '';
    if (!url.startsWith('/api')) return;
    if (PUBLIC_PATHS.has(url)) return;

    const raw = request.cookies[SESSION_COOKIE];
    const unsigned = raw ? request.unsignCookie(raw) : null;
    const sessionId = unsigned?.valid ? unsigned.value : null;
    const user = sessionId ? await validateSession(options.db, sessionId) : null;

    if (!user) {
      reply.code(401).send({ error: 'Требуется авторизация', code: 'unauthorized' });
      return reply;
    }
    request.userId = user.id;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.code(error.statusCode).send({ error: error.message, details: error.details });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({
        error: 'Некорректные данные',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
      return;
    }
    const fastifyError = error as { statusCode?: number; message?: string };
    const statusCode = fastifyError.statusCode ?? 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'Необработанная ошибка');
    reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Внутренняя ошибка' : (fastifyError.message ?? 'Ошибка'),
    });
  });

  app.get('/api/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

  await app.register(
    async (api) => {
      await registerAuthRoutes(api);
      await registerCatalogRoutes(api);
      await registerDayRoutes(api);
      await registerPlanRoutes(api);
      await registerMeasurementRoutes(api);
      await registerMetricsRoutes(api);
      await registerSettingsRoutes(api);
      await registerBackupRoutes(api);
    },
    { prefix: '/api' },
  );

  if (options.webDir && fs.existsSync(options.webDir)) {
    const webDir = options.webDir;
    // index: 'index.html' is needed for the root: without it static answers
    // the root with a 403 and never reaches the SPA fallback below.
    await app.register(fastifyStatic, { root: webDir, index: 'index.html' });

    // SPA fallback: any non-API path serves index.html, the client routes it.
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) {
        reply.code(404).send({ error: 'Метод не найден' });
        return;
      }
      reply.type('text/html').sendFile('index.html', webDir);
    });
  } else {
    app.setNotFoundHandler((_request, reply) => {
      reply.code(404).send({ error: 'Не найдено' });
    });
  }

  return app;
}

