import { useState } from 'react';
import {
  CalendarDays,
  Check,
  FileText,
  LayoutList,
  Columns3,
  Pencil,
  Plus,
  Trash2,
  Clock3,
  ClipboardCheck,
} from 'lucide-react';
import type { Entry } from '../../../../packages/contracts';
import { date, localInput, todayKey } from '../api';
import { useApp } from '../store';
import { Badge, Button, Empty, PageHead } from '../ui';
import { EntryEditor } from '../pages/editors';
import { DeleteEntry, Menu, Privacy } from './shared';

export function TasksPage() {
  const { records, update, toast, studentName } = useApp();
  const [filter, setFilter] = useState('upcoming'),
    [view, setView] = useState('list'),
    [edit, setEdit] = useState<{ kind: 'task' | 'note'; entry?: Entry } | null>(null),
    [del, setDel] = useState<Entry | null>(null);
  const tasks = records.task
    .filter((t) =>
      filter === 'done'
        ? t.data.done
        : !t.data.done &&
          (filter !== 'today' || (t.data.due && localInput(t.data.due).startsWith(todayKey()))),
    )
    .sort((a, b) => (a.data.due || 'z').localeCompare(b.data.due || 'z'));
  const groups = [
    ...new Set(tasks.map((t) => (t.data.due ? localInput(t.data.due).slice(0, 10) : ''))),
  ];
  const taskRow = (t: Entry) => (
    <div className={`task-item ${t.data.done ? 'done' : ''}`} key={t.id}>
      <button
        className="task-checkbox"
        aria-label={t.data.done ? 'Вернуть задачу' : 'Завершить задачу'}
        onClick={async () => {
          try {
            await update(t, { done: !t.data.done });
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      >
        {t.data.done && <Check size={16} />}
      </button>
      <button className="task-body" onClick={() => setEdit({ kind: 'task', entry: t })}>
        <strong>{t.data.title}</strong>
        {t.data.description && <p className="muted">{t.data.description}</p>}
        <small
          className={
            t.data.due && new Date(t.data.due).getTime() < Date.now() && !t.data.done
              ? 'text-danger'
              : 'muted'
          }
        >
          <Clock3 size={14} />{' '}
          {t.data.due
            ? `${date(t.data.due, { hour: '2-digit', minute: '2-digit' })} МСК`
            : 'Без срока'}
          {t.student_id ? ` · ${studentName(t.student_id)}` : ''}
        </small>
      </button>
      <Menu label={`Действия с задачей: ${t.data.title}`}>
        <button onClick={() => setEdit({ kind: 'task', entry: t })}>
          <Pencil size={15} />
          Изменить задачу
        </button>
        <button className="text-danger" onClick={() => setDel(t)}>
          <Trash2 size={15} />
          Удалить задачу
        </button>
      </Menu>
    </div>
  );
  return (
    <>
      <PageHead
        title="Задачи и заметки"
        action={
          <div className="button-row">
            <Button onClick={() => setEdit({ kind: 'task' })}>
              <Plus size={19} />
              Добавить
            </Button>
            <Button
              variant={view === 'list' ? 'primary' : 'secondary'}
              onClick={() => setView('list')}
            >
              <LayoutList size={18} />
              Список
            </Button>
            <Button
              variant={view === 'board' ? 'primary' : 'secondary'}
              onClick={() => setView('board')}
            >
              <Columns3 size={18} />
              Доска
            </Button>
          </div>
        }
      />
      <div className="tabs page-tabs">
        {[
          ['today', 'Сегодня'],
          ['upcoming', 'Предстоящие'],
          ['done', 'Выполненные'],
          ['notes', 'Заметки'],
        ].map(([v, n]) => (
          <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
            {n}
            {v === 'today' && (
              <Badge>
                {
                  records.task.filter(
                    (t) =>
                      !t.data.done && t.data.due && localInput(t.data.due).startsWith(todayKey()),
                  ).length
                }
              </Badge>
            )}
          </button>
        ))}
      </div>
      <div className={filter === 'notes' ? '' : 'cabinet-grid'}>
        {filter !== 'notes' && (
          <div>
            {view === 'list' ? (
              <>
                {groups.map((day) => (
                  <section className="panel" key={day}>
                    <div className="section-heading">
                      <h2>
                        {!day
                          ? 'Без срока'
                          : day === todayKey()
                            ? 'Сегодня'
                            : date(`${day}T12:00:00+03:00`, { day: 'numeric', month: 'long' })}
                      </h2>
                      <small className="muted">
                        {
                          tasks.filter(
                            (t) => (t.data.due ? localInput(t.data.due).slice(0, 10) : '') === day,
                          ).length
                        }{' '}
                        задач
                      </small>
                    </div>
                    {tasks
                      .filter(
                        (t) => (t.data.due ? localInput(t.data.due).slice(0, 10) : '') === day,
                      )
                      .map(taskRow)}
                  </section>
                ))}
              </>
            ) : (
              <div className="cabinet-columns">
                {[
                  ['overdue', 'Срок прошёл'],
                  ['planned', 'Запланировано'],
                ].map(([value, label]) => (
                  <section className="panel" key={value}>
                    <h2>
                      {filter === 'done'
                        ? value === 'planned'
                          ? 'Выполнено'
                          : 'Срок ранее'
                        : label}
                    </h2>
                    {tasks
                      .filter((t) =>
                        value === 'overdue'
                          ? t.data.due && new Date(t.data.due).getTime() < Date.now()
                          : !t.data.due || new Date(t.data.due).getTime() >= Date.now(),
                      )
                      .map(taskRow)}
                  </section>
                ))}
              </div>
            )}
            {!tasks.length && (
              <section className="panel">
                <Empty
                  icon={ClipboardCheck}
                  title={
                    filter === 'done'
                      ? 'Завершённые дела появятся здесь'
                      : 'На этот период задач нет'
                  }
                  text="Добавьте рабочую задачу или выберите другой фильтр."
                />
              </section>
            )}
          </div>
        )}
        <section className={filter === 'notes' ? 'panel' : ''}>
          <div className="section-heading">
            <h2>Личные заметки</h2>
            <button
              className="icon-btn bordered"
              aria-label="Добавить заметку"
              onClick={() => setEdit({ kind: 'note' })}
            >
              <Plus size={20} />
            </button>
          </div>
          {records.note.map((n) => (
            <article className="note-card" key={n.id}>
              <div className="section-heading">
                <span className="round-icon purple">
                  <FileText size={21} />
                </span>
                <h3>{n.data.title}</h3>
                <Menu label={`Действия с заметкой: ${n.data.title}`}>
                  <button onClick={() => setEdit({ kind: 'note', entry: n })}>
                    <Pencil size={15} />
                    Изменить заметку
                  </button>
                  <button className="text-danger" onClick={() => setDel(n)}>
                    <Trash2 size={15} />
                    Удалить заметку
                  </button>
                </Menu>
              </div>
              <p className="pre-wrap">{n.data.text}</p>
              <div className="button-row space-between">
                <Privacy>Только для меня</Privacy>
                <small className="muted">
                  {date(n.updated_at, { day: 'numeric', month: 'short' })}
                </small>
              </div>
            </article>
          ))}
          {!records.note.length && (
            <div className="note-card">
              <h3>Хорошая идея не потеряется</h3>
              <p className="muted">Запишите наблюдение после занятия.</p>
            </div>
          )}
          <Button variant="secondary" onClick={() => setEdit({ kind: 'note' })}>
            <Pencil size={16} />
            Записать мысль…
          </Button>
        </section>
      </div>
      {edit && <EntryEditor kind={edit.kind} entry={edit.entry} onClose={() => setEdit(null)} />}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}
