import { z } from 'zod';

export type Role = 'teacher' | 'student' | 'guest';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  settings: Record<string, unknown>;
  owner_id: string | null;
};
export type Student = {
  id: string;
  user_id: string;
  name: string;
  grade: string;
  goal: string;
  program: string;
  status: 'active' | 'paused';
  color: string;
  created_at: string;
};
export type Board = {
  id: string;
  title: string;
  owner_id: string;
  student_id: string | null;
  archived: boolean;
  updated_at: string;
  permission?: 'admin' | 'edit' | 'view';
  pages?: Page[];
};
export type Page = {
  id: string;
  board_id: string;
  title: string;
  position: number;
  revision: number;
  scene?: ElementData[];
  background?: string;
};
export type ElementData = {
  id: string;
  type: string;
  version: number;
  versionNonce: number;
  isDeleted?: boolean;
  [key: string]: unknown;
};
export type SceneChange = { element: ElementData; baseVersion: number | null };
export type RecordKind =
  | 'lesson'
  | 'homework'
  | 'material'
  | 'result'
  | 'report'
  | 'transaction'
  | 'document'
  | 'task'
  | 'note'
  | 'notification';
export type Entry = {
  id: string;
  kind: RecordKind;
  owner_id: string;
  student_id: string | null;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
};
export type Asset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  excalidraw_id?: string;
  board_id?: string;
};

const text = z.string().trim().max(20000);
const title = z.string().trim().min(1).max(250);
const uuid = z.uuid();
const files = z.array(uuid).max(30).default([]);
const iso = z.iso.datetime({ offset: true });
export const studentSchema = z.object({
  name: title,
  grade: z.string().max(50).default(''),
  goal: text.default(''),
  program: text.default(''),
  status: z.enum(['active', 'paused']).default('active'),
  color: z.enum(['purple', 'mint', 'peach', 'blue']).default('purple'),
});
export const recordSchemas = {
  lesson: z.object({
    title,
    start: iso,
    duration: z.number().int().min(15).max(240),
    price: z.number().min(0).max(100000),
    status: z.enum(['planned', 'completed', 'cancelled', 'rescheduled']),
    boardId: uuid.nullable().optional(),
    studentIds: z.array(uuid).max(20).default([]),
    notes: text.default(''),
    rescheduleRequest: text.optional(),
  }),
  homework: z.object({
    title,
    description: text,
    due: iso,
    status: z.enum(['assigned', 'draft', 'submitted', 'reviewed']),
    fileIds: files,
    answer: text.default(''),
    answerFileIds: files,
    feedback: text.default(''),
    score: z.number().min(0).max(1000).nullable().default(null),
    maxScore: z.number().min(1).max(1000).default(10),
  }),
  material: z.object({
    title,
    description: text.default(''),
    folder: z.string().max(100).default('Общее'),
    fileIds: files,
    shared: z.boolean().default(false),
    studentIds: z.array(uuid).max(100).default([]),
  }),
  result: z.object({
    title,
    date: iso,
    score: z.number().min(0).max(1000),
    maxScore: z.number().min(1).max(1000),
    topic: title,
    recommendation: text.default(''),
    skill: z.enum(['learning', 'repeat', 'mastered']).default('learning'),
  }),
  report: z.object({
    title,
    month: z.string().regex(/^\d{4}-\d{2}$/),
    summary: text,
    plan: text,
    shared: z.boolean().default(false),
  }),
  transaction: z.object({
    title,
    date: iso,
    amount: z.number().positive().max(10000000),
    type: z.enum(['payment', 'income', 'expense']),
  }),
  document: z.object({
    title,
    type: z.enum(['contract', 'consent', 'invoice', 'other']),
    status: z.enum(['draft', 'signed', 'archived']),
    fileIds: files,
  }),
  task: z.object({
    title,
    due: iso.nullable().default(null),
    done: z.boolean().default(false),
    description: text.default(''),
  }),
  note: z.object({ title, text }),
  notification: z.object({
    title,
    message: text,
    path: z.string().startsWith('/').max(300),
    read: z.boolean().default(false),
    recipientId: uuid,
    dedupeKey: z.string().max(300).optional(),
  }),
};
export const kinds = Object.keys(recordSchemas) as RecordKind[];
export const sceneChangeSchema = z.object({
  operationId: uuid,
  changes: z
    .array(
      z.object({
        baseVersion: z.number().int().min(0).nullable(),
        element: z
          .object({
            id: z.string().min(1).max(128),
            type: z.enum([
              'selection',
              'rectangle',
              'diamond',
              'ellipse',
              'line',
              'arrow',
              'freedraw',
              'text',
              'image',
              'frame',
              'magicframe',
              'embeddable',
              'iframe',
            ]),
            version: z.number().int().min(1).max(2147483647),
            versionNonce: z.number(),
            isDeleted: z.boolean().optional(),
          })
          .passthrough(),
      }),
    )
    .min(1)
    .max(1000),
});
