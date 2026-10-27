import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { Server } from 'socket.io';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { openDatabase, migrate, type Database } from './db';
import { authenticate, boardAccess, HttpError, requireThat, hashToken } from './security';
import type { User } from '../../../packages/contracts';
import { authRoutes } from './modules/auth';
import { boardRoutes } from './modules/boards';
import { recordRoutes, tickNotifications } from './modules/records';
import { fileRoutes } from './modules/files';

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
  interface FastifyContextConfig {
    public?: boolean;
  }
}
export type Config = {
  databaseUrl?: string;
  dataDir: string;
  origin: string;
  secure: boolean;
  setupToken?: string;
  production: boolean;
  logger?: boolean;
  reminders?: boolean;
};
export type Context = { db: Database; config: Config; io: Server; app: FastifyInstance };
export async function createApp(options: Partial<Config> = {}, database?: Database) {
  const config: Config = {
    dataDir: path.resolve('data'),
    origin: 'http://localhost:5173',
    secure: false,
    production: false,
    reminders: true,
    ...options,
  };
  if (
    config.production &&
    (!config.setupToken || !config.origin.startsWith('https://') || !config.secure)
  )
    throw new Error('Production requires SETUP_TOKEN, HTTPS APP_ORIGIN and COOKIE_SECURE=true.');
  await mkdir(path.join(config.dataDir, 'files'), { recursive: true });
  const db =
    database || (await openDatabase(config.databaseUrl, path.join(config.dataDir, 'postgres')));
  await migrate(db);
  const app = Fastify({
    logger: config.logger ?? true,
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: config.production ? (_address, hop) => hop === 0 : false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    allowList: (req) => !req.url.startsWith('/api/') || req.url === '/api/v1/health',
    keyGenerator: (req) =>
      req.cookies.osnova_session ? hashToken(req.cookies.osnova_session) : req.ip,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        objectSrc: ["'none'"],
        frameSrc: ["'self'", 'blob:'],
        upgradeInsecureRequests: config.production ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 5 } });
  app.decorateRequest('user', null as unknown as User);
  app.addHook('onRequest', async (req) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin)
        requireThat(
          origin === config.origin ||
            (!config.production &&
              [
                'http://localhost:5173',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:3001',
                'http://localhost:3001',
              ].includes(origin)),
          403,
          'Запрос с другого сайта запрещён',
        );
    }
  });
  app.addHook('preHandler', async (req) => {
    if (req.url.startsWith('/api/') && !req.routeOptions.config.public)
      req.user = await authenticate(db, req.cookies.osnova_session);
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        error: 'Проверьте заполненные поля',
        details: error.issues.map((x) => `${x.path.join('.')}: ${x.message}`),
      });
    const e = error as Error & { statusCode?: number; code?: string };
    if (e.code === '23505') return reply.code(409).send({ error: 'Такая запись уже существует' });
    if (e.code === 'FST_REQ_FILE_TOO_LARGE')
      return reply.code(413).send({ error: 'Файл больше 25 МБ' });
    if (e instanceof HttpError || (e.statusCode && e.statusCode < 500))
      return reply.code(e.statusCode || 400).send({ error: e.message });
    req.log.error({ err: e }, 'request failed');
    reply.code(500).send({ error: 'Не удалось сохранить изменения. Повторите попытку.' });
  });
  const io = new Server(app.server, {
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: config.origin, credentials: true },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      const sameHost =
        req.headers.host === new URL(config.origin).host ||
        (!config.production &&
          ['127.0.0.1:5173', 'localhost:5173', '127.0.0.1:3001', 'localhost:3001'].includes(
            req.headers.host || '',
          ));
      callback(
        null,
        origin === config.origin ||
          (!origin && req.headers['sec-fetch-site'] === 'same-origin' && sameHost) ||
          (!config.production &&
            [
              'http://localhost:5173',
              'http://127.0.0.1:5173',
              'http://127.0.0.1:3001',
              'http://localhost:3001',
            ].includes(origin || '')),
      );
    },
  });
  const ctx = { db, config, io, app };
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const session = app.parseCookie(cookieHeader).osnova_session;
      socket.data.user = await authenticate(db, session);
      socket.data.session = session;
      next();
    } catch {
      next(new Error('Войдите в аккаунт'));
    }
  });
  io.on('connection', (socket) => {
    const user = socket.data.user as User;
    socket.join(`user:${user.id}`);
    socket.on('join-page', async (payload, ack) => {
      try {
        await authenticate(db, socket.data.session);
        const pageId = z.uuid().parse(payload.pageId);
        const page = (await db.query('SELECT board_id FROM pages WHERE id=$1', [pageId])).rows[0];
        requireThat(page, 404, 'Страница не найдена');
        const board = await boardAccess(db, user, page.board_id);
        for (const room of socket.rooms) if (room.startsWith('page:')) await socket.leave(room);
        await socket.join(`page:${pageId}`);
        await socket.join(`board:${board.id}`);
        socket.data.pageId = pageId;
        socket.data.boardId = board.id;
        socket
          .to(`page:${pageId}`)
          .emit('presence', { id: socket.id, name: user.name, joined: true });
        const peers = await io.in(`page:${pageId}`).fetchSockets();
        ack?.({
          ok: true,
          peers: peers
            .filter((p) => p.id !== socket.id)
            .map((p) => ({ id: p.id, name: p.data.user.name })),
        });
      } catch {
        ack?.({ error: 'Доступ к доске закрыт' });
      }
    });
    let cursorAt = 0;
    socket.on('cursor', (data) => {
      if (!socket.data.pageId || Date.now() - cursorAt < 35) return;
      const point = z
        .object({
          x: z.number().finite().min(-1e7).max(1e7),
          y: z.number().finite().min(-1e7).max(1e7),
        })
        .safeParse(data);
      if (point.success) {
        cursorAt = Date.now();
        socket
          .to(`page:${socket.data.pageId}`)
          .emit('cursor', { id: socket.id, name: user.name, ...point.data });
      }
    });
    socket.on('disconnect', () => {
      if (socket.data.pageId)
        socket.to(`page:${socket.data.pageId}`).emit('presence', { id: socket.id, joined: false });
    });
  });
  app.get('/api/v1/health', { config: { public: true } }, async () => {
    await db.query('SELECT 1');
    return { ok: true, version: '0.1.0' };
  });
  await authRoutes(ctx);
  await boardRoutes(ctx);
  await fileRoutes(ctx);
  await recordRoutes(ctx);
  const webPath = path.resolve('dist/web');
  if (existsSync(webPath)) {
    await app.register(staticPlugin, { root: webPath, wildcard: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/')
        ? reply.code(404).send({ error: 'Адрес не найден' })
        : reply.sendFile('index.html'),
    );
  }
  // Enforce expired/revoked guest sessions even while a socket stays connected.
  const timer = setInterval(async () => {
    for (const socket of io.sockets.sockets.values()) {
      try {
        await authenticate(db, socket.data.session);
      } catch {
        socket.emit('access-revoked');
        socket.disconnect(true);
      }
    }
    if (config.reminders) await tickNotifications(ctx).catch((e) => app.log.error(e));
  }, 30000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    io.disconnectSockets();
    io.close();
    if (!database) await db.close();
  });
  return { app, db, io, config };
}
