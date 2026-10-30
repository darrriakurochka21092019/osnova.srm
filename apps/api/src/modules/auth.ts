import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Context } from '../app';
import { hashToken, token, passwordHash, verifyPassword, requireThat, audit } from '../security';
import type { Queryable } from '../db';

const credentials = z.object({
  email: z.email().toLowerCase().max(254),
  password: z.string().min(10).max(128),
});
export async function createSession(
  db: Queryable,
  reply: FastifyReply,
  userId: string,
  secure: boolean,
  inviteId?: string,
  hours = 24 * 14,
  persistent = true,
) {
  const raw = token();
  await db.query(
    'INSERT INTO sessions(token_hash,user_id,invite_id,expires_at) VALUES($1,$2,$3,$4)',
    [
      hashToken(raw),
      userId,
      inviteId || null,
      new Date(Date.now() + hours * 3600000).toISOString(),
    ],
  );
  await audit(db, userId, 'session.created');
  reply.setCookie('osnova_session', raw, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/',
    ...(persistent ? { maxAge: Math.floor(hours * 3600) } : {}),
  });
}
export async function authRoutes({ app, db, config, io }: Context) {
  app.get('/api/v1/bootstrap', { config: { public: true } }, async () => ({
    setupNeeded: !(await db.query("SELECT id FROM users WHERE role='teacher' LIMIT 1")).rows.length,
    tokenRequired: !!config.setupToken,
  }));
  app.post(
    '/api/v1/auth/setup',
    {
      config: {
        public: true,
        rateLimit: {
          max: 5,
          timeWindow: '10 minutes',
          keyGenerator: (req: FastifyRequest) => req.ip,
        },
      },
    },
    async (req, reply) => {
      const input = credentials
        .extend({ name: z.string().trim().min(1).max(100), setupToken: z.string().optional() })
        .parse(req.body);
      requireThat(
        !config.setupToken || hashToken(input.setupToken || '') === hashToken(config.setupToken),
        403,
        'Неверный ключ первоначальной настройки',
      );
      const hash = await passwordHash(input.password);
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.query('LOCK TABLE users IN EXCLUSIVE MODE');
        requireThat(
          !(await tx.query("SELECT id FROM users WHERE role='teacher'")).rows.length,
          409,
          'Аккаунт преподавателя уже создан',
        );
        await tx.query(
          "INSERT INTO users(id,role,name,email,password_hash) VALUES($1,'teacher',$2,$3,$4)",
          [id, input.name, input.email, hash],
        );
      });
      await createSession(db, reply, id, config.secure);
      return { ok: true };
    },
  );
  app.post(
    '/api/v1/auth/login',
    {
      config: {
        public: true,
        rateLimit: {
          max: 10,
          timeWindow: '10 minutes',
          keyGenerator: (req: FastifyRequest) => req.ip,
        },
      },
    },
    async (req, reply) => {
      const input = credentials.extend({ rememberMe: z.boolean().default(true) }).parse(req.body);
      const u = (
        await db.query('SELECT * FROM users WHERE email=$1 AND active=true', [input.email])
      ).rows[0];
      requireThat(
        (await verifyPassword(input.password, u?.password_hash)) && u,
        401,
        'Неверная почта или пароль',
      );
      await createSession(
        db,
        reply,
        u.id,
        config.secure,
        undefined,
        input.rememberMe ? 24 * 14 : 24,
        input.rememberMe,
      );
      return { ok: true };
    },
  );
  app.post('/api/v1/auth/logout', async (req, reply) => {
    await audit(db, req.user.id, 'session.logout');
    await db.query('DELETE FROM sessions WHERE token_hash=$1', [
      hashToken(req.cookies.osnova_session || ''),
    ]);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.session === req.cookies.osnova_session) socket.disconnect(true);
    reply.clearCookie('osnova_session', { path: '/' });
    return { ok: true };
  });
  app.get('/api/v1/me', async (req) => req.user);
  app.patch('/api/v1/me', async (req) => {
    const input = z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        settings: z
          .object({
            reminders: z.boolean().optional(),
            notifications: z
              .object({
                enabled: z.boolean(),
                lessons: z.boolean(),
                homework: z.boolean(),
                organization: z.boolean(),
              })
              .optional(),
            reminderMinutes: z.number().int().min(5).max(1440).optional(),
            quietStart: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .optional(),
            quietEnd: z
              .string()
              .regex(/^\d{2}:\d{2}$/)
              .optional(),
            onboardingComplete: z.boolean().optional(),
            theme: z.enum(['light', 'dark']).optional(),
          })
          .optional(),
      })
      .parse(req.body);
    return (
      await db.query(
        'UPDATE users SET name=COALESCE($2,name),settings=settings || $3::jsonb WHERE id=$1 RETURNING id,role,name,email,owner_id,settings',
        [req.user.id, input.name || null, JSON.stringify(input.settings || {})],
      )
    ).rows[0];
  });
  app.post('/api/v1/auth/password', async (req, reply) => {
    const input = z
      .object({ currentPassword: z.string().max(128), newPassword: z.string().min(10).max(128) })
      .parse(req.body);
    const u = (await db.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]))
      .rows[0];
    requireThat(
      req.user.role !== 'guest' && (await verifyPassword(input.currentPassword, u.password_hash)),
      403,
      'Текущий пароль неверен',
    );
    await db.transaction(async (tx) => {
      await tx.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        req.user.id,
        await passwordHash(input.newPassword),
      ]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);
    });
    await audit(db, req.user.id, 'password.changed');
    io.in(`user:${req.user.id}`).disconnectSockets();
    await createSession(db, reply, req.user.id, config.secure);
    return { ok: true };
  });
  app.get(
    '/api/v1/auth/sessions',
    async (req) =>
      (
        await db.query(
          'SELECT created_at,expires_at,token_hash=$2 AS current FROM sessions WHERE user_id=$1 AND expires_at>now() ORDER BY created_at DESC',
          [req.user.id, hashToken(req.cookies.osnova_session || '')],
        )
      ).rows,
  );
  app.post('/api/v1/auth/revoke-other-sessions', async (req) => {
    await db.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [
      req.user.id,
      hashToken(req.cookies.osnova_session || ''),
    ]);
    for (const socket of io.sockets.sockets.values())
      if (socket.data.user.id === req.user.id && socket.data.session !== req.cookies.osnova_session)
        socket.disconnect(true);
    return { ok: true };
  });
  app.post(
    '/api/v1/invites/redeem',
    {
      config: {
        public: true,
        rateLimit: {
          max: 15,
          timeWindow: '10 minutes',
          keyGenerator: (req: FastifyRequest) => req.ip,
        },
      },
    },
    async (req, reply) => {
      const input = z
        .object({
          token: z.string().min(20).max(100),
          name: z.string().trim().min(1).max(100),
          email: z.email().toLowerCase().optional(),
          password: z.string().min(10).max(128).optional(),
        })
        .parse(req.body);
      const result = await db.transaction(async (tx) => {
        const i = (
          await tx.query('SELECT * FROM invites WHERE token_hash=$1 FOR UPDATE', [
            hashToken(input.token),
          ])
        ).rows[0];
        requireThat(
          i && !i.revoked && new Date(i.expires_at).getTime() > Date.now() && i.uses < i.max_uses,
          410,
          'Приглашение истекло или отозвано. Попросите новую ссылку',
        );
        let userId = randomUUID();
        if (i.permission === 'account') {
          requireThat(
            input.email && input.password,
            400,
            'Для кабинета укажите почту и пароль от 10 символов',
          );
          const student = (
            await tx.query('SELECT * FROM students WHERE id=$1 AND owner_id=$2', [
              i.student_id,
              i.owner_id,
            ])
          ).rows[0];
          requireThat(student && student.status === 'active', 403, 'Кабинет недоступен');
          userId = student.user_id;
          await tx.query('DELETE FROM sessions WHERE user_id=$1', [userId]);
          await tx.query('UPDATE users SET name=$2,email=$3,password_hash=$4 WHERE id=$1', [
            userId,
            input.name,
            input.email,
            await passwordHash(input.password!),
          ]);
        } else {
          await tx.query("INSERT INTO users(id,owner_id,role,name) VALUES($1,$2,'guest',$3)", [
            userId,
            i.owner_id,
            input.name,
          ]);
          await tx.query(
            'INSERT INTO board_members(board_id,user_id,permission) VALUES($1,$2,$3)',
            [i.board_id, userId, i.permission],
          );
        }
        await tx.query('UPDATE invites SET uses=uses+1 WHERE id=$1', [i.id]);
        return {
          id: i.id,
          userId,
          boardId: i.board_id,
          account: i.permission === 'account',
          expires: i.expires_at,
        };
      });
      // Account activation is permanent; a board guest session is limited by its invitation.
      if (result.account) io.in(`user:${result.userId}`).disconnectSockets();
      await createSession(
        db,
        reply,
        result.userId,
        config.secure,
        result.account ? undefined : result.id,
        result.account
          ? 336
          : Math.max(0.01, (new Date(result.expires).getTime() - Date.now()) / 3600000),
      );
      return { boardId: result.boardId, account: result.account };
    },
  );
  app.post(
    '/api/v1/invites/info',
    {
      config: {
        public: true,
        rateLimit: {
          max: 20,
          timeWindow: '10 minutes',
          keyGenerator: (req: FastifyRequest) => req.ip,
        },
      },
    },
    async (req) => {
      const input = z.object({ token: z.string().min(20).max(100) }).parse(req.body);
      const i = (
        await db.query(
          'SELECT permission,expires_at,revoked,uses,max_uses FROM invites WHERE token_hash=$1',
          [hashToken(input.token)],
        )
      ).rows[0];
      requireThat(
        i && !i.revoked && new Date(i.expires_at).getTime() > Date.now() && i.uses < i.max_uses,
        410,
        'Приглашение истекло или отозвано. Попросите новую ссылку',
      );
      return { account: i.permission === 'account', permission: i.permission };
    },
  );
}
