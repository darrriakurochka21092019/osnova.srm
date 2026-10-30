import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  FileText,
  Clock3,
  ArrowRight,
  Send,
  FolderOpen,
  Pencil,
  CheckCircle2,
  LockKeyhole,
  ClipboardCheck,
} from 'lucide-react';
import type { Entry } from '../../../../packages/contracts';
import { date, fromLocalInput, localInput, todayKey } from '../api';
import { useApp } from '../store';
import {
  Avatar,
  Badge,
  Button,
  Empty,
  Field,
  FileLinks,
  FileUpload,
  FormError,
  Modal,
  PageHead,
  SearchBox,
} from '../ui';
import { EntryEditor, StudentSelect } from '../pages/editors';
import { AddToBoard } from '../pages/learning';
import {
  DeleteEntry,
  FilePreview,
  Menu,
  Privacy,
  WorkBadge,
  workLabels,
  workStatus,
} from './shared';

export function HomeworkPage() {
  const { user, records, students, studentName } = useApp();
  const teacher = user.role === 'teacher';
  const [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [sid, setSid] = useState(''),
    [due, setDue] = useState(''),
    [del, setDel] = useState<Entry | null>(null);
  const works = records.homework,
    count = (value: string) => works.filter((h) => workStatus(h) === value).length;
  const overdue = works.filter(
    (h) =>
      ['assigned', 'draft'].includes(h.data.status) && new Date(h.data.due).getTime() < Date.now(),
  );
  const list = works
    .filter(
      (h) =>
        (!sid || h.student_id === sid) &&
        (status === 'all' ||
          (status === 'assigned'
            ? ['assigned', 'draft'].includes(workStatus(h))
            : workStatus(h) === status)) &&
        h.data.title.toLowerCase().includes(query.toLowerCase()) &&
        (!due ||
          (due === 'overdue'
            ? overdue.includes(h)
            : localInput(h.data.due).startsWith(todayKey()))),
    )
    .sort((a, b) => a.data.due.localeCompare(b.data.due));
  return (
    <>
      <PageHead
        title="Домашние задания"
        description={
          teacher
            ? 'Выдача, проверка и обратная связь'
            : 'Выполняйте задания и получайте комментарии преподавателя'
        }
        action={
          teacher && (
            <Link className="btn btn-primary" to="/homework/new">
              <Plus size={19} />
              Назначить задание
            </Link>
          )
        }
      />
      <div className="tabs cabinet-homework-tabs">
        {[
          ['submitted', 'На проверке'],
          ['assigned', 'Выданные'],
          ['revision', 'Нужна доработка'],
          ['reviewed', 'Проверенные'],
        ].map(([v, n]) => (
          <button
            className={status === v ? 'active' : ''}
            key={v}
            onClick={() => setStatus(status === v ? 'all' : v)}
          >
            {n}
            <Badge tone={v === 'submitted' ? 'peach' : 'purple'}>
              {v === 'assigned' ? count(v) + count('draft') : count(v)}
            </Badge>
          </button>
        ))}
      </div>
      <div className="cabinet-filters cabinet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Найти задание…" />
        {teacher && (
          <select
            aria-label="Ученик в заданиях"
            value={sid}
            onChange={(e) => setSid(e.target.value)}
          >
            <option value="">Все ученики</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Сроки заданий" value={due} onChange={(e) => setDue(e.target.value)}>
          <option value="">Все сроки</option>
          <option value="today">Сегодня</option>
          <option value="overdue">Срок прошёл</option>
        </select>
      </div>
      <section className="panel table-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Работа</th>
                {teacher && <th>Ученик</th>}
                <th>Срок · МСК</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((h) => {
                const s = students.find((s) => s.id === h.student_id);
                return (
                  <tr key={h.id}>
                    <td>
                      <Link className="table-person" to={`/homework/${h.id}`}>
                        <span className="round-icon blue">
                          <FileText size={23} />
                        </span>
                        <div>
                          <strong>{h.data.title}</strong>
                          <small>
                            {(h.data.fileIds?.length || 0) + (h.data.answerFileIds?.length || 0)}{' '}
                            файлов
                            {h.data.score !== null ? ` · ${h.data.score}/${h.data.maxScore}` : ''}
                          </small>
                        </div>
                      </Link>
                    </td>
                    {teacher && (
                      <td>
                        <Link className="table-person" to={`/students/${h.student_id}`}>
                          <Avatar name={studentName(h.student_id)} color={s?.color} small />
                          <div>
                            <strong>{studentName(h.student_id)}</strong>
                            <small>{s?.grade}</small>
                          </div>
                        </Link>
                      </td>
                    )}
                    <td className={overdue.includes(h) ? 'text-danger' : 'muted'}>
                      {date(h.data.due, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <WorkBadge entry={h} />
                    </td>
                    <td>
                      <div className="button-row">
                        <Link
                          className={`btn btn-${teacher && h.data.status === 'submitted' ? 'primary' : 'secondary'}`}
                          to={`/homework/${h.id}`}
                        >
                          {teacher && h.data.status === 'submitted' ? 'Проверить' : 'Открыть'}
                        </Link>
                        {teacher && (
                          <Menu label={`Действия с заданием: ${h.data.title}`}>
                            <Link to={`/homework/${h.id}/edit`}>
                              <Pencil size={15} />
                              Изменить задание
                            </Link>
                            <button className="text-danger" onClick={() => setDel(h)}>
                              <FileText size={15} />
                              Удалить
                            </button>
                          </Menu>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty
            icon={ClipboardCheck}
            title="Задания не найдены"
            text={
              works.length
                ? 'Измените фильтры или поисковый запрос.'
                : teacher
                  ? 'Добавьте инструкцию и материалы, выберите ученика и срок.'
                  : 'Назначенные преподавателем задания появятся здесь.'
            }
          />
        )}
      </section>
      <div className="cabinet-columns">
        <section className="panel">
          <h2>Статусы заданий</h2>
          <div className="cabinet-status-summary">
            {['submitted', 'assigned', 'reviewed', 'revision'].map((v) => (
              <button key={v} onClick={() => setStatus(v)}>
                <Badge tone={v === 'submitted' ? 'peach' : v === 'reviewed' ? 'mint' : 'purple'}>
                  {workLabels[v]}
                </Badge>
                <strong>{count(v)}</strong>
                <small className="muted">
                  {v === 'submitted'
                    ? 'Ожидают проверки'
                    : v === 'assigned'
                      ? 'Задания в работе'
                      : v === 'reviewed'
                        ? 'Обратная связь дана'
                        : 'Требуются исправления'}
                </small>
              </button>
            ))}
          </div>
        </section>
        <section className="panel cabinet-note peach">
          <h2>
            Требует внимания <Badge tone="peach">{overdue.length}</Badge>
          </h2>
          {overdue.slice(0, 3).map((h) => (
            <Link className="cabinet-mini-row" to={`/homework/${h.id}`} key={h.id}>
              <FileText size={20} />
              <div>
                <strong>{h.data.title}</strong>
                <small>{studentName(h.student_id)} · срок прошёл</small>
              </div>
              <ArrowRight size={16} />
            </Link>
          ))}
          {!overdue.length && <p className="muted">Заданий с прошедшим сроком нет.</p>}
        </section>
      </div>
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}

export function HomeworkComposer() {
  const { id } = useParams(),
    [search] = useSearchParams(),
    navigate = useNavigate();
  const { records, students, create, update } = useApp(),
    entry = records.homework.find((h) => h.id === id);
  const [sid, setSid] = useState(entry?.student_id || search.get('student') || ''),
    [title, setTitle] = useState(entry?.data.title || ''),
    [description, setDescription] = useState(entry?.data.description || ''),
    [deadline, setDeadline] = useState(
      localInput(entry?.data.due || new Date(Date.now() + 86400000)),
    ),
    [maxScore, setMaxScore] = useState(entry?.data.maxScore || 10),
    [files, setFiles] = useState<string[]>(entry?.data.fileIds || []),
    [library, setLibrary] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (id && !entry)
    return <Empty title="Задание не найдено" action={<Link to="/homework">К заданиям</Link>} />;
  const student = students.find((s) => s.id === sid);
  return (
    <>
      <PageHead title={entry ? 'Изменить домашнее задание' : 'Новое домашнее задание'} />
      <div className="cabinet-composer">
        <section className="panel">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const data = {
                  title,
                  description,
                  due: fromLocalInput(deadline),
                  fileIds: files,
                  maxScore,
                };
                const saved = entry
                  ? await update(entry, data, sid)
                  : await create('homework', { ...data, status: 'assigned' }, sid);
                navigate(`/homework/${saved.id}`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Кому">
              <StudentSelect value={sid} onChange={setSid} />
            </Field>
            <Field label="Название">
              <input
                required
                maxLength={250}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Тема и название работы"
              />
            </Field>
            <Field label="Что нужно сделать">
              <textarea
                required
                rows={7}
                maxLength={20000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Напишите инструкцию — каждый шаг с новой строки"
              />
            </Field>
            <div className="section-heading">
              <h3>Материалы к заданию</h3>
              <Button type="button" variant="secondary" onClick={() => setLibrary(true)}>
                <FolderOpen size={16} />
                Из материалов
              </Button>
            </div>
            <FileUpload ids={files} onChange={setFiles} />
            <div className="form-grid">
              <Field label="Сдать до · МСК">
                <input
                  required
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
              <Field label="Максимум баллов">
                <input
                  type="number"
                  min={Math.max(1, entry?.data.score || 1)}
                  max={1000}
                  required
                  value={maxScore}
                  onChange={(e) => setMaxScore(Number(e.target.value))}
                />
              </Field>
            </div>
            <FormError error={error} />
            <div className="form-actions">
              <Link
                className="btn btn-secondary"
                to={entry ? `/homework/${entry.id}` : '/homework'}
              >
                Отмена
              </Link>
              <Button type="submit" disabled={busy || !sid || !deadline}>
                {busy ? 'Сохраняем…' : entry ? 'Сохранить изменения' : 'Назначить задание'}
              </Button>
            </div>
          </form>
        </section>
        <section className="panel">
          <h2>Как увидит ученик</h2>
          <div className="cabinet-student-preview">
            <h2>{title || 'Название задания'}</h2>
            <div className="button-row space-between">
              <span className="table-person">
                <Avatar name={student?.name || 'Ученик'} color={student?.color} small />
                <span>{student?.name || 'Выберите ученика'}</span>
              </span>
              <Badge>
                Сдать до{' '}
                {deadline
                  ? `${date(fromLocalInput(deadline), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} МСК`
                  : '—'}
              </Badge>
            </div>
            <hr />
            <h3>Задание</h3>
            <p className="pre-wrap">{description || 'Здесь появится ваша инструкция.'}</p>
            <h3>Материалы</h3>
            <FileLinks ids={files} />
            {!files.length && <p className="muted">Без дополнительных файлов</p>}
          </div>
          <div className="cabinet-success">
            <CheckCircle2 size={25} />
            <span>После назначения работа появится в кабинете ученика.</span>
          </div>
        </section>
      </div>
      {library && (
        <Modal title="Материалы к заданию" onClose={() => setLibrary(false)}>
          <div className="list-links">
            {records.material
              .filter((m) => m.data.fileIds?.length)
              .map((m) => (
                <button
                  key={m.id}
                  className="cabinet-mini-row"
                  onClick={() => {
                    setFiles([...new Set([...files, ...m.data.fileIds])]);
                    setLibrary(false);
                  }}
                >
                  <FileText size={20} />
                  <div>
                    <strong>{m.data.title}</strong>
                    <small>{m.data.folder}</small>
                  </div>
                  <Plus size={17} />
                </button>
              ))}
          </div>
          {!records.material.some((m) => m.data.fileIds?.length) && (
            <Empty
              title="В библиотеке пока нет файлов"
              text="Загрузите файл прямо в форму задания."
            />
          )}
        </Modal>
      )}
    </>
  );
}

export function HomeworkReview({ entry: h }: { entry: Entry }) {
  const { students, studentName, update } = useApp();
  const [feedback, setFeedback] = useState(h.data.feedback || ''),
    [score, setScore] = useState<number | null>(h.data.score ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [board, setBoard] = useState<string | null>(null),
    [note, setNote] = useState(false),
    [result, setResult] = useState('reviewed');
  const student = students.find((s) => s.id === h.student_id),
    answerFiles = h.data.answerFileIds || [];
  const save = async (status: string) => {
    setBusy(true);
    setError('');
    try {
      await update(h, { feedback, score, status });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead
        title={h.data.title}
        description={`${studentName(h.student_id)}${student?.grade ? ` · ${student.grade}` : ''} · Срок: ${date(h.data.due, { hour: '2-digit', minute: '2-digit' })} МСК`}
        action={
          <Link className="btn btn-secondary" to={`/homework/${h.id}/edit`}>
            <Pencil size={16} />
            Изменить задание
          </Link>
        }
      />
      <div className="button-row" style={{ marginBottom: 18 }}>
        <WorkBadge entry={h} />
        {h.data.score !== null && (
          <Badge tone="mint">
            {h.data.score} из {h.data.maxScore}
          </Badge>
        )}
      </div>
      <div className="cabinet-grid">
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>Ответ ученика</h2>
              {answerFiles.length > 0 && (
                <Button variant="secondary" onClick={() => setBoard(answerFiles[0])}>
                  <Pencil size={17} />
                  Пометки на работе
                </Button>
              )}
            </div>
            {h.data.answer && <p className="pre-wrap assignment-instruction">{h.data.answer}</p>}
            {answerFiles.length ? (
              <FilePreview ids={answerFiles} title="Работа ученика" />
            ) : (
              !h.data.answer && (
                <Empty
                  title="Ответ ещё не добавлен"
                  text="После отправки здесь появится текст или файлы ученика."
                />
              )
            )}
          </section>
          <section className="panel">
            <h2>Что нужно сделать</h2>
            <p className="pre-wrap assignment-instruction">
              {h.data.description || 'Инструкция не добавлена.'}
            </p>
            <h3>Материалы задания</h3>
            <FileLinks ids={h.data.fileIds} />
            {h.data.fileIds?.length > 0 && (
              <Button variant="secondary" onClick={() => setBoard(h.data.fileIds[0])}>
                Разобрать на доске <ArrowRight size={16} />
              </Button>
            )}
          </section>
        </div>
        <div>
          <section className="panel">
            <h2>Обратная связь</h2>
            <Field label={`Выполнено верно · из ${h.data.maxScore}`}>
              <input
                aria-label={`Баллы · максимум ${h.data.maxScore}`}
                type="number"
                min={0}
                max={h.data.maxScore}
                value={score ?? ''}
                onChange={(e) => setScore(e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>
            <Field label="Комментарий ученику">
              <textarea
                aria-label="Комментарий преподавателя"
                maxLength={20000}
                rows={7}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Что получилось и что стоит повторить"
              />
            </Field>
            <Field label="Результат">
              <select value={result} onChange={(e) => setResult(e.target.value)}>
                <option value="reviewed">Проверено — работа принята</option>
                <option value="assigned">Нужна доработка</option>
              </select>
            </Field>
            <FormError error={error} />
            <div className="button-row">
              <Button
                variant="secondary"
                disabled={busy || !feedback.trim()}
                onClick={() => void save('assigned')}
              >
                Вернуть на доработку
              </Button>
              <Button
                disabled={
                  busy ||
                  (score !== null && (score < 0 || score > h.data.maxScore)) ||
                  (result === 'assigned' && !feedback.trim())
                }
                onClick={() => void save(result)}
              >
                {busy ? 'Сохраняем…' : 'Завершить проверку'}
              </Button>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading">
              <h3>
                <LockKeyhole size={18} /> Личная заметка
              </h3>
              <button className="text-link" onClick={() => setNote(true)}>
                Добавить <Plus size={15} />
              </button>
            </div>
            <Privacy />
          </section>
        </div>
      </div>
      {board && (
        <AddToBoard fileId={board} studentId={h.student_id} onClose={() => setBoard(null)} />
      )}
      {note && (
        <EntryEditor
          kind="note"
          studentId={h.student_id || undefined}
          preset={{ title: `Работа: ${h.data.title}` }}
          onClose={() => setNote(false)}
        />
      )}
    </>
  );
}
