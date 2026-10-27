import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import type { Database, Queryable } from './db';
import type { User } from '../../../packages/contracts';

const scrypt = promisify(scryptCallback);
export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export async function audit(db: Queryable, userId: string, action: string, targetId?: string) {
  await db.query('INSERT INTO audit_events(id,user_id,action,target_id) VALUES($1,$2,$3,$4)', [
    randomUUID(),
    userId,
    action,
    targetId || null,
  ]);
}
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
export const requireThat = (condition: unknown, status = 403, message = 'Доступ запрещён') => {
  if (!condition) throw new HttpError(status, message);
};
export async function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded?: string) {
  const [salt, hex] = (encoded || '').split(':');
  if (!salt || !hex) {
    await scrypt(password, 'missing-account', 64);
    return false;
  }
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export async function authenticate(db: Queryable, sessionToken?: string): Promise<User> {
  if (!sessionToken) throw new HttpError(401, 'Войдите в аккаунт');
  const { rows } = await db.query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    LEFT JOIN invites i ON i.id=s.invite_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true
    AND (s.invite_id IS NULL OR (i.revoked=false AND i.expires_at>now()))`,
    [hashToken(sessionToken)],
  );
  if (!rows[0]) throw new HttpError(401, 'Сеанс завершён. Войдите снова');
  const { password_hash, ...user } = rows[0];
  return user;
}
export async function boardAccess(db: Queryable, user: User, boardId: string, write = false) {
  const { rows } = await db.query(
    `SELECT b.*, CASE WHEN b.owner_id=$2 THEN 'admin' ELSE m.permission END AS permission
    FROM boards b LEFT JOIN board_members m ON m.board_id=b.id AND m.user_id=$2
    WHERE b.id=$1 AND (b.owner_id=$2 OR m.user_id=$2)`,
    [boardId, user.id],
  );
  requireThat(rows[0], 404, 'Доска не найдена или доступ закрыт');
  if (write)
    requireThat(
      rows[0].permission !== 'view' && !rows[0].archived,
      403,
      'Доска доступна только для просмотра',
    );
  return rows[0];
}
export async function studentAccess(db: Queryable, ownerId: string, studentId?: string | null) {
  if (!studentId) return;
  const r = await db.query('SELECT id FROM students WHERE id=$1 AND owner_id=$2', [
    studentId,
    ownerId,
  ]);
  requireThat(r.rows[0], 404, 'Ученик не найден');
}
export function detectMime(buffer: Buffer): string | null {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return null;
}
