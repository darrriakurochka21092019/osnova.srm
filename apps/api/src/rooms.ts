import { randomUUID } from 'node:crypto';
import type { Queryable } from './db';
import type { User } from '../../../packages/contracts';
import { hashToken, requireThat, token } from './security';
import { unifyLegacyScenes } from '../../../packages/contracts/canvas';

/** An upgrade of the existing scene format, not a replacement for the board protocol. */
export async function ensureCanvas(tx: Queryable, boardId: string, authorId: string) {
  const pages = (
    await tx.query('SELECT * FROM pages WHERE board_id=$1 ORDER BY position,id FOR UPDATE', [
      boardId,
    ])
  ).rows;
  const board = (await tx.query('SELECT * FROM boards WHERE id=$1 FOR UPDATE', [boardId])).rows[0];
  if (board.canvas_page_id) return board;
  requireThat(pages.length, 404, 'Холст не найден');
  const primary = pages[0],
    scene = unifyLegacyScenes(pages);
  requireThat(
    scene.length <= 15000,
    413,
    'Слишком много объектов для объединения. Исходные материалы сохранены',
  );
  if (pages.length > 1 || primary.scene.length) {
    await tx.query(
      'INSERT INTO snapshots(id,page_id,revision,scene,author_id) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), primary.id, primary.revision, JSON.stringify(primary.scene), authorId],
    );
    const old = new Map<string, any>(primary.scene.map((e: any) => [e.id, e]));
    for (const e of scene)
      if (old.has(e.id)) e.version = Math.max(e.version, old.get(e.id).version + 1);
    await tx.query('UPDATE pages SET scene=$2,revision=revision+1,title=$3 WHERE id=$1', [
      primary.id,
      JSON.stringify(scene),
      'Холст',
    ]);
  }
  return (
    await tx.query('UPDATE boards SET canvas_page_id=$2,updated_at=now() WHERE id=$1 RETURNING *', [
      boardId,
      primary.id,
    ])
  ).rows[0];
}

/** One persistent room for a student, or for the same set of group members. */
export async function ensureClassroom(
  tx: Queryable,
  ownerId: string,
  studentIds: string[],
  preferredBoardId?: string | null,
) {
  const ids = [...new Set(studentIds)].sort();
  requireThat(
    ids.length > 0 && ids.length <= 20,
    400,
    'Выберите ученика или участников мини-группы',
  );
  await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [ownerId]);
  const students = (
    await tx.query(
      'SELECT * FROM students WHERE owner_id=$1 AND id=ANY($2::uuid[]) ORDER BY name',
      [ownerId, ids],
    )
  ).rows;
  requireThat(students.length === ids.length, 404, 'Участник занятия не найден');
  const key = ids.join(','),
    existing = (
      await tx.query('SELECT * FROM classrooms WHERE owner_id=$1 AND member_key=$2', [ownerId, key])
    ).rows[0];
  if (ids.length > 1) for (const sid of ids) await ensureClassroom(tx, ownerId, [sid]);
  let room = existing;
  if (!room) {
    const name = students.map((s) => s.name.split(' ')[0]).join(', ');
    let board = preferredBoardId
      ? (
          await tx.query(
            'SELECT * FROM boards WHERE id=$1 AND owner_id=$2 AND archived=false AND NOT EXISTS(SELECT 1 FROM classrooms WHERE board_id=$1)',
            [preferredBoardId, ownerId],
          )
        ).rows[0]
      : null;
    if (!board && ids.length === 1)
      board = (
        await tx.query(
          `SELECT b.* FROM boards b WHERE b.owner_id=$1 AND b.student_id=$2 AND b.archived=false
      AND NOT EXISTS(SELECT 1 FROM classrooms c WHERE c.board_id=b.id)
      AND NOT EXISTS(SELECT 1 FROM board_members m WHERE m.board_id=b.id AND m.user_id<>$3)
      ORDER BY b.updated_at DESC LIMIT 1`,
          [ownerId, ids[0], students[0].user_id],
        )
      ).rows[0];
    if (!board) {
      const boardId = randomUUID(),
        pageId = randomUUID();
      await tx.query(
        'INSERT INTO boards(id,owner_id,student_id,title,canvas_page_id,background) VALUES($1,$2,$3,$4,$5,$6)',
        [
          boardId,
          ownerId,
          ids.length === 1 ? ids[0] : null,
          `Учебная доска · ${name}`.slice(0, 200),
          pageId,
          'dots',
        ],
      );
      await tx.query('INSERT INTO pages(id,board_id,title,position) VALUES($1,$2,$3,0)', [
        pageId,
        boardId,
        'Холст',
      ]);
      board = { id: boardId, canvas_page_id: pageId };
    } else board = await ensureCanvas(tx, board.id, ownerId);
    const id = randomUUID(),
      inviteId = randomUUID(),
      raw = token();
    await tx.query(
      `INSERT INTO invites(id,owner_id,board_id,token_hash,permission,expires_at,max_uses) VALUES($1,$2,$3,$4,'edit','9999-12-31T00:00:00Z',1000000000)`,
      [inviteId, ownerId, board.id, hashToken(raw)],
    );
    room = (
      await tx.query(
        'INSERT INTO classrooms(id,owner_id,board_id,member_key,title,kind,invite_id,link_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [
          id,
          ownerId,
          board.id,
          key,
          ids.length === 1 ? students[0].name : `Мини-группа · ${name}`.slice(0, 200),
          ids.length === 1 ? 'individual' : 'group',
          inviteId,
          raw,
        ],
      )
    ).rows[0];
    for (const s of students)
      await tx.query('INSERT INTO classroom_members(classroom_id,student_id) VALUES($1,$2)', [
        room.id,
        s.id,
      ]);
  }
  // An explicitly prepared legacy board can become the canonical board while the room is empty.
  if (preferredBoardId && preferredBoardId !== room.board_id) {
    const empty = !(
      await tx.query(
        'SELECT id FROM pages WHERE board_id=$1 AND jsonb_array_length(scene)>0 LIMIT 1',
        [room.board_id],
      )
    ).rows.length;
    const used = (
      await tx.query('SELECT id FROM lesson_sessions WHERE classroom_id=$1 LIMIT 1', [room.id])
    ).rows.length;
    const prepared = (
      await tx.query(
        'SELECT * FROM boards WHERE id=$1 AND owner_id=$2 AND archived=false AND NOT EXISTS(SELECT 1 FROM classrooms WHERE board_id=$1)',
        [preferredBoardId, ownerId],
      )
    ).rows[0];
    if (empty && !used && prepared) {
      await ensureCanvas(tx, prepared.id, ownerId);
      await tx.query('UPDATE boards SET archived=true WHERE id=$1', [room.board_id]);
      await tx.query('UPDATE classrooms SET board_id=$2 WHERE id=$1', [room.id, prepared.id]);
      await tx.query('UPDATE invites SET board_id=$2 WHERE id=$1', [room.invite_id, prepared.id]);
      room.board_id = prepared.id;
      await tx.query(
        `UPDATE records SET data=jsonb_set(data,'{boardId}',to_jsonb($2::text)) WHERE kind='lesson' AND data->>'classroomId'=$1`,
        [room.id, prepared.id],
      );
    }
  }
  for (const s of students)
    await tx.query(
      `INSERT INTO board_members(board_id,user_id,permission) VALUES($1,$2,'edit') ON CONFLICT DO NOTHING`,
      [room.board_id, s.user_id],
    );
  return room;
}

export async function classroomAccess(db: Queryable, user: User, id: string) {
  const room = (
    await db.query(
      'SELECT c.*,b.archived FROM classrooms c JOIN boards b ON b.id=c.board_id WHERE c.id=$1',
      [id],
    )
  ).rows[0];
  requireThat(room, 404, 'Учебная комната не найдена');
  if (room.owner_id === user.id) return { ...room, permission: 'admin' as const };
  const membership = (
    await db.query(
      `SELECT cm.permission FROM classroom_members cm JOIN students s ON s.id=cm.student_id
    WHERE cm.classroom_id=$1 AND s.user_id=$2 AND s.status='active'`,
      [id, user.id],
    )
  ).rows[0];
  if (membership) return { ...room, permission: membership.permission };
  if (user.role === 'guest') {
    const scoped = (
      await db.query(
        `SELECT cm.permission FROM classroom_guests g
      LEFT JOIN classroom_members cm ON cm.classroom_id=$1 AND cm.student_id=g.student_id
      LEFT JOIN students s ON s.id=g.student_id WHERE g.user_id=$2
      AND ((g.student_id IS NOT NULL AND cm.student_id IS NOT NULL AND s.status='active') OR (g.student_id IS NULL AND g.source_room_id=$1))`,
        [id, user.id],
      )
    ).rows[0];
    if (scoped && room.owner_id === user.owner_id) {
      const permission = scoped.permission || 'edit';
      await db.query(
        'INSERT INTO board_members(board_id,user_id,permission) VALUES($1,$2,$3) ON CONFLICT(board_id,user_id) DO UPDATE SET permission=$3',
        [room.board_id, user.id, permission],
      );
      return { ...room, permission };
    }
  }
  requireThat(false, 404, 'Учебная комната не найдена или доступ закрыт');
  return room;
}

export const lessonStudentIds = (record: any): string[] =>
  [
    ...new Set<string>([record.student_id, ...(record.data.studentIds || [])].filter(Boolean)),
  ].sort();
export async function attachLessonRoom(tx: Queryable, record: any) {
  const ids = lessonStudentIds(record);
  if (!ids.length) return record;
  const room = await ensureClassroom(tx, record.owner_id, ids, record.data.boardId);
  const data = {
    ...record.data,
    classroomId: room.id,
    boardId: room.board_id,
    ...(record.data.boardId && record.data.boardId !== room.board_id
      ? { materialBoardId: record.data.boardId }
      : {}),
  };
  return (
    await tx.query('UPDATE records SET data=$2 WHERE id=$1 RETURNING *', [
      record.id,
      JSON.stringify(data),
    ])
  ).rows[0];
}
