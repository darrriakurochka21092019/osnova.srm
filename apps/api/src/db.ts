import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface Queryable {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  dump?(): Promise<Blob>;
}

export async function openDatabase(url?: string, dataDir = 'data/postgres'): Promise<Database> {
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      query: (sql, params) => pool.query(sql, params),
      async transaction(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await fn(client);
          await client.query('COMMIT');
          return result;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (dataDir !== 'memory://') await mkdir(path.resolve(dataDir), { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    query: (sql, params) => db.query(sql, params),
    transaction: (fn) => db.transaction((tx) => fn(tx)),
    close: () => db.close(),
    dump: () => db.dumpDataDir('gzip'),
  };
}

export async function migrate(db: Database) {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY, owner_id UUID REFERENCES users(id), role TEXT NOT NULL CHECK(role IN ('teacher','student','guest')),
      name TEXT NOT NULL, email TEXT UNIQUE, password_hash TEXT, active BOOLEAN NOT NULL DEFAULT true,
      settings JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS invites (
      id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), token_hash TEXT UNIQUE NOT NULL,
      board_id UUID, student_id UUID, permission TEXT NOT NULL CHECK(permission IN ('view','edit','account')),
      expires_at TIMESTAMPTZ NOT NULL, revoked BOOLEAN NOT NULL DEFAULT false, max_uses INT NOT NULL DEFAULT 1, uses INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invite_id UUID REFERENCES invites(id), expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS students (
      id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), user_id UUID UNIQUE NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, grade TEXT NOT NULL DEFAULT '', goal TEXT NOT NULL DEFAULT '', program TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active', color TEXT NOT NULL DEFAULT 'purple', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS boards (
      id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), student_id UUID REFERENCES students(id),
      title TEXT NOT NULL, archived BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS board_members (
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL CHECK(permission IN ('view','edit')), PRIMARY KEY(board_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS pages (
      id UUID PRIMARY KEY, board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE, title TEXT NOT NULL,
      position INT NOT NULL, revision INT NOT NULL DEFAULT 0, scene JSONB NOT NULL DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS operations (
      page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE, operation_id UUID NOT NULL, user_id UUID NOT NULL REFERENCES users(id),
      result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(page_id,operation_id)
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id UUID PRIMARY KEY, page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE, revision INT NOT NULL,
      scene JSONB NOT NULL, author_id UUID NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS files (
      id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
      name TEXT NOT NULL, mime TEXT NOT NULL, size INT NOT NULL, storage_key TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL,
      excalidraw_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(board_id,excalidraw_id)
    );
    CREATE TABLE IF NOT EXISTS records (
      id UUID PRIMARY KEY, kind TEXT NOT NULL, owner_id UUID NOT NULL REFERENCES users(id), student_id UUID REFERENCES students(id),
      data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id UUID PRIMARY KEY, user_id UUID REFERENCES users(id), action TEXT NOT NULL, target_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS records_owner_kind ON records(owner_id,kind);
    CREATE INDEX IF NOT EXISTS boards_owner ON boards(owner_id);
    CREATE INDEX IF NOT EXISTS pages_board ON pages(board_id,position);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    ALTER TABLE boards ADD COLUMN IF NOT EXISTS canvas_page_id UUID;
    ALTER TABLE boards ADD COLUMN IF NOT EXISTS background TEXT NOT NULL DEFAULT 'white';
    CREATE UNIQUE INDEX IF NOT EXISTS notification_dedupe ON records(owner_id,(data->>'dedupeKey')) WHERE kind='notification' AND data->>'dedupeKey' IS NOT NULL;
  `;
  // Each statement is executable both by PostgreSQL and the local PGlite adapter.
  for (const statement of schema
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean))
    await db.query(statement);
}
