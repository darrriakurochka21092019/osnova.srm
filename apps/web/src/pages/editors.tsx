import { useState } from 'react';
import { Copy, Plus, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, localInput, fromLocalInput } from '../api';
import { useApp } from '../store';
import { Button, Field, FileUpload, FormError, Modal, SaveButton } from '../ui';
import type { Board, Entry, RecordKind, Student } from '../../../../packages/contracts';

export function StudentSelect({
  value,
  onChange,
  optional = false,
}: {
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  const { students } = useApp();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={!optional}>
      <option value="">{optional ? 'Все ученики / без ученика' : 'Выберите ученика'}</option>
      {students.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.grade || 'Без класса'}
        </option>
      ))}
    </select>
  );
}
export function StudentEditor({ student, onClose }: { student?: Student; onClose: () => void }) {
  const { refresh, toast } = useApp();
  const [form, setForm] = useState(
      student || { name: '', grade: '', goal: '', program: '', status: 'active', color: 'purple' },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={student ? 'Карточка ученика' : 'Новый ученик'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              `/students${student ? `/${student.id}` : ''}`,
              form,
              student ? 'PATCH' : 'POST',
            );
            await refresh();
            toast('Ученик сохранён');
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Имя ученика">
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="form-grid">
          <Field label="Класс">
            <input
              placeholder="Например, 9 класс"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: e.target.value })}
            />
          </Field>
          <Field label="Статус">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'paused' })}
            >
              <option value="active">Занимается</option>
              <option value="paused">Пауза — вход закрыт</option>
            </select>
          </Field>
        </div>
        <Field label="Цель обучения">
          <textarea
            rows={3}
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
            placeholder="К чему идём и что важно ученику"
          />
        </Field>
        <Field label="Индивидуальная программа">
          <textarea
            rows={6}
            value={form.program}
            onChange={(e) => setForm({ ...form, program: e.target.value })}
            placeholder="Блоки, темы и последовательность занятий"
          />
        </Field>
        <Field label="Цвет карточки">
          <select value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
            <option value="purple">Лавандовый</option>
            <option value="mint">Мятный</option>
            <option value="peach">Персиковый</option>
            <option value="blue">Голубой</option>
          </select>
        </Field>
        <FormError error={error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  );
}
export function BoardCreate({ onClose, studentId }: { onClose: () => void; studentId?: string }) {
  const { refresh } = useApp(),
    navigate = useNavigate();
  const [form, setForm] = useState({ title: 'Новая учебная доска', studentId: studentId || '' }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Новая доска" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const b = await api<Board>('/boards', { ...form, studentId: form.studentId || null });
            await refresh();
            onClose();
            navigate(`/board/${b.id}`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Название">
          <input
            autoFocus
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="Ученик" hint="Его кабинет автоматически получит доступ к доске.">
          <StudentSelect
            value={form.studentId}
            onChange={(v) => setForm({ ...form, studentId: v })}
            optional
          />
        </Field>
        <FormError error={error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <SaveButton busy={busy} label="Создать доску" />
        </div>
      </form>
    </Modal>
  );
}
export function InviteDialog({
  url,
  onClose,
  title = 'Приглашение готово',
}: {
  url: string;
  onClose: () => void;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">
        Передайте ссылку участнику. После входа он получит только назначенный ему доступ.
      </p>
      <textarea
        className="invite-url"
        readOnly
        value={url}
        rows={3}
        onFocus={(e) => e.target.select()}
      />
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={16} />
          {copied ? 'Скопировано' : 'Скопировать'}
        </Button>
      </div>
    </Modal>
  );
}
const defaults: Record<RecordKind, Record<string, any>> = {
  lesson: {
    title: '',
    start: localInput(new Date()),
    duration: 60,
    price: 1500,
    status: 'planned',
    boardId: '',
    studentIds: [],
    notes: '',
  },
  homework: {
    title: '',
    description: '',
    due: localInput(new Date(Date.now() + 3 * 86400000)),
    status: 'assigned',
    fileIds: [],
    answer: '',
    answerFileIds: [],
    feedback: '',
    score: null,
    maxScore: 10,
  },
  material: {
    title: '',
    description: '',
    folder: 'Общее',
    fileIds: [],
    shared: false,
    studentIds: [],
  },
  result: {
    title: '',
    date: localInput(new Date()),
    score: 0,
    maxScore: 100,
    topic: '',
    recommendation: '',
    skill: 'learning',
  },
  report: {
    title: 'Ежемесячный отчёт',
    month: localInput(new Date()).slice(0, 7),
    summary: '',
    plan: '',
    shared: false,
  },
  transaction: {
    title: 'Оплата занятий',
    date: localInput(new Date()),
    amount: 1500,
    type: 'payment',
  },
  document: { title: '', type: 'contract', status: 'draft', fileIds: [] },
  task: { title: '', due: '', done: false, description: '' },
  note: { title: '', text: '' },
  notification: { title: '', message: '', path: '/', recipientId: '', read: false },
};
const names: Record<RecordKind, string> = {
  lesson: 'Урок',
  homework: 'Задание',
  material: 'Учебный материал',
  result: 'Результат работы',
  report: 'Ежемесячный отчёт',
  transaction: 'Операция',
  document: 'Документ',
  task: 'Задача',
  note: 'Заметка',
  notification: 'Уведомление',
};
export function EntryEditor({
  kind,
  entry,
  studentId,
  preset,
  onClose,
}: {
  kind: RecordKind;
  entry?: Entry;
  studentId?: string;
  preset?: Record<string, any>;
  onClose: () => void;
}) {
  const { create, update, students, boards, records } = useApp();
  const [form, setForm] = useState<Record<string, any>>(() => {
    const f = { ...defaults[kind], ...entry?.data, ...preset };
    for (const key of ['start', 'due', 'date']) if (f[key] && entry) f[key] = localInput(f[key]);
    return f;
  });
  const [sid, setSid] = useState(entry?.student_id || studentId || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key: string, label: string, type = 'text', required = true) => (
    <Field label={label}>
      <input
        type={type}
        required={required}
        value={form[key] ?? ''}
        step={type === 'number' ? 'any' : undefined}
        min={
          type === 'number'
            ? key === 'duration'
              ? 15
              : key === 'maxScore'
                ? 1
                : key === 'amount'
                  ? 0.01
                  : 0
            : undefined
        }
        max={key === 'duration' ? 240 : undefined}
        onChange={(e) => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
      />
    </Field>
  );
  const area = (key: string, label: string, rows = 4) => (
    <Field label={label}>
      <textarea rows={rows} value={form[key] || ''} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );
  const select = (key: string, label: string, options: Record<string, string>) => (
    <Field label={label}>
      <select value={form[key]} onChange={(e) => set(key, e.target.value)}>
        {Object.entries(options).map(([v, l]) => (
          <option value={v} key={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
  const group = (key = 'studentIds') => (
    <Field
      label={kind === 'material' ? 'Кому доступен материал' : 'Участники мини-группы'}
      hint={
        kind === 'material'
          ? 'Если никто не выбран, опубликованный материал доступен всем ученикам.'
          : 'Основной ученик выбран выше. Здесь можно добавить остальных.'
      }
    >
      <div className="checkbox-list">
        {students
          .filter((s) => s.status === 'active' && s.id !== sid)
          .map((s) => (
            <label key={s.id}>
              <input
                type="checkbox"
                checked={form[key]?.includes(s.id) || false}
                onChange={(e) =>
                  set(
                    key,
                    e.target.checked
                      ? [...form[key], s.id]
                      : form[key].filter((id: string) => id !== s.id),
                  )
                }
              />
              {s.name}
            </label>
          ))}
      </div>
    </Field>
  );
  const generateReport = () => {
    const lessons = records.lesson.filter(
      (r) =>
        (r.student_id === sid || r.data.studentIds?.includes(sid)) &&
        r.data.status === 'completed' &&
        localInput(r.data.start).startsWith(form.month),
    );
    const results = records.result.filter(
      (r) => r.student_id === sid && localInput(r.data.date).startsWith(form.month),
    );
    const works = records.homework.filter(
      (r) =>
        r.student_id === sid &&
        r.data.status === 'reviewed' &&
        localInput(r.updated_at).startsWith(form.month),
    );
    setForm((f) => ({
      ...f,
      summary: `Проведено занятий: ${lessons.length}.\nИзученные темы: ${[...new Set(lessons.map((r) => r.data.title))].join('; ') || 'пока нет проведённых уроков'}.\nПроверено домашних работ: ${works.length}.\n${works.map((r) => `${r.data.title}: ${r.data.score ?? 'проверено'} / ${r.data.maxScore}. ${r.data.feedback}`).join('\n')}\n${results.map((r) => `${r.data.title}: ${r.data.score}/${r.data.maxScore}. ${r.data.recommendation}`).join('\n')}`,
      plan: results
        .filter((r) => r.data.skill === 'repeat')
        .map((r) => `Повторить: ${r.data.topic}`)
        .join('\n'),
    }));
  };
  return (
    <Modal
      title={`${entry ? 'Изменить:' : 'Добавить:'} ${names[kind].toLowerCase()}`}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const data = { ...form };
            for (const key of ['start', 'due', 'date'])
              if (key in data) data[key] = data[key] ? fromLocalInput(data[key]) : null;
            if (kind === 'lesson') data.boardId = data.boardId || null;
            if (kind === 'notification')
              data.recipientId = students.find((s) => s.id === sid)?.user_id;
            if (entry) await update(entry, data, sid || null);
            else await create(kind, data, sid || null);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {input('title', 'Название')}
        {!['note', 'material'].includes(kind) && (
          <Field label="Ученик">
            <StudentSelect
              value={sid}
              onChange={setSid}
              optional={
                ['task', 'document', 'lesson'].includes(kind) ||
                (kind === 'transaction' && form.type !== 'payment')
              }
            />
          </Field>
        )}
        {kind === 'lesson' && (
          <>
            <div className="form-grid">
              {input('start', 'Начало · московское время', 'datetime-local')}
              {input('duration', 'Длительность, минут', 'number')}
              {input('price', 'Стоимость за ученика, ₽', 'number')}
              {select('status', 'Статус', {
                planned: 'Запланирован',
                completed: 'Проведён',
                rescheduled: 'Перенесён',
                cancelled: 'Отменён',
              })}
            </div>
            <Field label="Доска">
              <select value={form.boardId || ''} onChange={(e) => set('boardId', e.target.value)}>
                <option value="">Создать при открытии урока</option>
                {boards
                  .filter((b) => !b.archived)
                  .map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.title}
                    </option>
                  ))}
              </select>
            </Field>
            {group()}
            {area('notes', 'Заметки к уроку')}
          </>
        )}
        {kind === 'homework' && (
          <>
            {area('description', 'Инструкция', 6)}
            <div className="form-grid">
              {input('due', 'Сдать до · МСК', 'datetime-local')}
              {input('maxScore', 'Максимум баллов', 'number')}
            </div>
            {select('status', 'Статус', {
              assigned: 'К выполнению',
              draft: 'Черновик ученика',
              submitted: 'На проверке',
              reviewed: 'Проверено',
            })}
            <Field label="Материалы задания">
              <FileUpload ids={form.fileIds} onChange={(v) => set('fileIds', v)} />
            </Field>
          </>
        )}
        {kind === 'material' && (
          <>
            {input('folder', 'Папка')}
            {area('description', 'Описание')}
            <Field label="Файлы">
              <FileUpload ids={form.fileIds} onChange={(v) => set('fileIds', v)} />
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.shared}
                onChange={(e) => set('shared', e.target.checked)}
              />
              Доступен ученикам
            </label>
            {form.shared && group()}
          </>
        )}
        {kind === 'result' && (
          <>
            {input('topic', 'Тема / навык')}
            <div className="form-grid">
              {input('date', 'Дата работы · МСК', 'datetime-local')}
              {select('skill', 'Освоение', {
                learning: 'Изучаем',
                repeat: 'Нужно повторить',
                mastered: 'Освоено',
              })}
              {input('score', 'Набрано баллов', 'number')}
              {input('maxScore', 'Максимум баллов', 'number')}
            </div>
            {area('recommendation', 'Что получилось и что повторить')}
          </>
        )}
        {kind === 'report' && (
          <>
            {input('month', 'Отчётный месяц', 'month')}
            <Button type="button" variant="secondary" disabled={!sid} onClick={generateReport}>
              Собрать по проведённым урокам
            </Button>
            {area('summary', 'Итоги месяца', 8)}
            {area('plan', 'План на следующий месяц', 5)}
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.shared}
                onChange={(e) => set('shared', e.target.checked)}
              />
              Показать в кабинете ученика
            </label>
          </>
        )}
        {kind === 'transaction' && (
          <>
            <div className="form-grid">
              {select('type', 'Тип', {
                payment: 'Оплата ученика',
                income: 'Прочий доход',
                expense: 'Расход',
              })}
              {input('amount', 'Сумма, ₽', 'number')}
            </div>
            {input('date', 'Дата · МСК', 'datetime-local')}
          </>
        )}
        {kind === 'document' && (
          <>
            <div className="form-grid">
              {select('type', 'Вид', {
                contract: 'Договор',
                consent: 'Согласие',
                invoice: 'Счёт',
                other: 'Другое',
              })}
              {select('status', 'Статус', {
                draft: 'Черновик',
                signed: 'Подписан',
                archived: 'В архиве',
              })}
            </div>
            <Field label="Файлы документа">
              <FileUpload ids={form.fileIds} onChange={(v) => set('fileIds', v)} />
            </Field>
          </>
        )}
        {kind === 'task' && (
          <>
            {input('due', 'Срок · московское время', 'datetime-local', false)}
            {area('description', 'Подробности')}
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.done}
                onChange={(e) => set('done', e.target.checked)}
              />
              Выполнено
            </label>
          </>
        )}
        {kind === 'note' && area('text', 'Заметка', 8)}
        {kind === 'notification' && (
          <>
            {area('message', 'Сообщение')}
            <p className="muted">Сообщение появится во встроенном центре уведомлений ученика.</p>
          </>
        )}
        <FormError error={error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <SaveButton busy={busy} />
        </div>
      </form>
    </Modal>
  );
}
