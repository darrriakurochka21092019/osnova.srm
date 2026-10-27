import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  FileText,
  Upload,
  Pencil,
  Trash2,
  ClipboardCheck,
  FolderOpen,
  Check,
  Clock3,
  Download,
  ChartNoAxesCombined,
  TrendingUp,
  Printer,
  Send,
  Bell,
  CircleHelp,
  PanelsTopLeft,
  CalendarDays,
  ShieldCheck,
  Wallet,
  X,
  Sparkles,
  Target,
  LogOut,
  BookOpen,
} from 'lucide-react';
import { api, date, fileUrl, localInput, money, statusLabels, upload } from '../api';
import { useApp } from '../store';
import {
  Avatar,
  Badge,
  Button,
  Confirm,
  Empty,
  Field,
  FileLinks,
  FileUpload,
  FormError,
  Modal,
  PageHead,
  SaveButton,
  SearchBox,
} from '../ui';
import { EntryEditor, StudentSelect } from './editors';
import { SectionHeading } from './workspace';
import type { Board, Entry, RecordKind } from '../../../../packages/contracts';

export function HomeworkPage() {
  const { user, records, studentName } = useApp();
  const [editor, setEditor] = useState(false),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [sid, setSid] = useState('');
  const list = records.homework
    .filter(
      (h) =>
        (!sid || h.student_id === sid) &&
        (status === 'all' || h.data.status === status) &&
        h.data.title.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => a.data.due.localeCompare(b.data.due));
  return (
    <>
      <PageHead
        eyebrow="ЗАКРЕПЛЯЕМ И ДВИГАЕМСЯ ДАЛЬШЕ"
        title="Домашние задания"
        description={
          user.role === 'teacher'
            ? 'От постановки задачи до обратной связи. Каждая работа на своём месте.'
            : 'Выполните работу, прикрепите ответ и получите комментарий преподавателя.'
        }
        action={
          user.role === 'teacher' && (
            <Button onClick={() => setEditor(true)}>
              <Plus size={18} />
              Назначить задание
            </Button>
          )
        }
      />
      <div className="filter-bar">
        <div className="tabs">
          {[
            ['all', 'Все'],
            ['assigned', 'К выполнению'],
            ['submitted', 'На проверке'],
            ['reviewed', 'Проверено'],
          ].map(([v, n]) => (
            <button key={v} className={status === v ? 'active' : ''} onClick={() => setStatus(v)}>
              {n}
            </button>
          ))}
        </div>
        <div className="filter-actions">
          <SearchBox value={query} onChange={setQuery} placeholder="Найти задание…" />
          {user.role === 'teacher' && <StudentSelect optional value={sid} onChange={setSid} />}
        </div>
      </div>
      <div className="assignment-grid">
        {list.map((h) => {
          const overdue =
            new Date(h.data.due).getTime() < Date.now() &&
            ['assigned', 'draft'].includes(h.data.status);
          return (
            <Link className="assignment-card" key={h.id} to={`/homework/${h.id}`}>
              <div className="assignment-top">
                <span className={`round-icon ${h.data.status === 'reviewed' ? 'mint' : 'purple'}`}>
                  <ClipboardCheck size={22} />
                </span>
                <Badge
                  tone={
                    h.data.status === 'reviewed'
                      ? 'mint'
                      : h.data.status === 'submitted'
                        ? 'peach'
                        : 'purple'
                  }
                >
                  {statusLabels[h.data.status]}
                </Badge>
              </div>
              <h2>{h.data.title}</h2>
              <p className="clamp muted">
                {h.data.description || 'Откройте работу, чтобы посмотреть материалы.'}
              </p>
              <div className="assignment-footer">
                <span>
                  <Clock3 size={14} />
                  <span className={overdue ? 'text-danger' : ''}>
                    До {date(h.data.due, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <ArrowUpRight size={18} />
              </div>
              {user.role === 'teacher' && (
                <small className="muted">{studentName(h.student_id)}</small>
              )}
              {h.data.score !== null && (
                <strong className="score-pill">
                  {h.data.score} / {h.data.maxScore} баллов
                </strong>
              )}
            </Link>
          );
        })}
      </div>
      {!list.length && (
        <Empty
          icon={ClipboardCheck}
          title="Здесь появятся задания"
          text={
            user.role === 'teacher'
              ? 'Добавьте инструкцию и материалы, выберите ученика и срок.'
              : 'Преподаватель назначит работу, и она появится в этом разделе.'
          }
        />
      )}{' '}
      {editor && <EntryEditor kind="homework" onClose={() => setEditor(false)} />}
    </>
  );
}
export function HomeworkDetail() {
  const { id } = useParams(),
    { records, user, studentName, update, toast, create } = useApp();
  const h = records.homework.find((r) => r.id === id);
  const [edit, setEdit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [answer, setAnswer] = useState(h?.data.answer || ''),
    [fileIds, setFileIds] = useState<string[]>(h?.data.answerFileIds || []),
    [feedback, setFeedback] = useState(h?.data.feedback || ''),
    [score, setScore] = useState<number | null>(h?.data.score ?? null),
    [addBoard, setAddBoard] = useState<string | null>(null);
  if (!h)
    return <Empty title="Задание не найдено" action={<Link to="/homework">К заданиям</Link>} />;
  const teacher = user.role === 'teacher';
  const save = async (status: string) => {
    setBusy(true);
    setError('');
    try {
      if (teacher) await update(h, { feedback, score, status });
      else await update(h, { answer, answerFileIds: fileIds, status });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link className="text-link back-link" to="/homework">
        <ChevronLeft size={16} />
        Все задания
      </Link>
      <PageHead
        title={h.data.title}
        description={`${teacher ? studentName(h.student_id) + ' · ' : ''}Срок: ${date(h.data.due, { year: 'numeric', hour: '2-digit', minute: '2-digit' })} · МСК`}
        action={
          teacher && (
            <Button variant="secondary" onClick={() => setEdit(true)}>
              <Pencil size={16} />
              Изменить задание
            </Button>
          )
        }
      />
      <div className="homework-layout">
        <section className="panel">
          <Badge tone={h.data.status === 'reviewed' ? 'mint' : 'purple'}>
            {statusLabels[h.data.status]}
          </Badge>
          <h2>Что нужно сделать</h2>
          <p className="pre-wrap assignment-instruction">
            {h.data.description || 'Инструкция не добавлена.'}
          </p>
          <h3>Материалы задания</h3>
          <FileLinks ids={h.data.fileIds} />
          {!h.data.fileIds?.length && <p className="muted">Дополнительных файлов нет.</p>}
          {h.data.fileIds?.length > 0 && teacher && (
            <Button variant="secondary" onClick={() => setAddBoard(h.data.fileIds[0])}>
              <PanelsTopLeft size={16} />
              Разобрать на доске
            </Button>
          )}
        </section>
        <section className="panel">
          <h2>{teacher ? 'Ответ ученика' : 'Мой ответ'}</h2>
          {teacher || h.data.status === 'reviewed' ? (
            <>
              <p className="pre-wrap">{h.data.answer || 'Текстовый ответ не добавлен.'}</p>
              <FileLinks ids={h.data.answerFileIds} />
              {teacher && h.data.answerFileIds?.length > 0 && (
                <Button variant="secondary" onClick={() => setAddBoard(h.data.answerFileIds[0])}>
                  <Pencil size={16} />
                  Пометки на работе
                </Button>
              )}
            </>
          ) : (
            <>
              <Field label="Ответ и комментарий">
                <textarea
                  rows={9}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Напишите ответ или прикрепите фотографию тетради"
                />
              </Field>
              <FileUpload ids={fileIds} onChange={setFileIds} />
              <p className="muted small-text">
                Черновик сохраняется по кнопке. После отправки работу увидит преподаватель.
              </p>
            </>
          )}
          {teacher ? (
            <>
              <hr />
              <h3>Обратная связь</h3>
              <Field label={`Баллы · максимум ${h.data.maxScore}`}>
                <input
                  type="number"
                  min={0}
                  max={h.data.maxScore}
                  value={score ?? ''}
                  onChange={(e) => setScore(e.target.value === '' ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="Комментарий преподавателя">
                <textarea
                  rows={5}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Что получилось и что стоит повторить"
                />
              </Field>
              <Button
                disabled={busy || (score !== null && score > h.data.maxScore)}
                onClick={() => save('reviewed')}
              >
                <Check size={17} />
                {busy ? 'Сохраняем…' : 'Завершить проверку'}
              </Button>
            </>
          ) : h.data.status === 'reviewed' ? (
            <div className="feedback-box">
              <span className="eyebrow">РАБОТА ПРОВЕРЕНА</span>
              <h2>
                {h.data.score !== null
                  ? `${h.data.score} / ${h.data.maxScore} баллов`
                  : 'Комментарий преподавателя'}
              </h2>
              <p className="pre-wrap">
                {h.data.feedback || 'Преподаватель отметил работу как проверенную.'}
              </p>
              <Link className="text-link" to="/progress">
                Посмотреть прогресс
                <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="form-actions">
              <Button disabled={busy} variant="secondary" onClick={() => save('draft')}>
                Сохранить черновик
              </Button>
              <Button
                disabled={busy || (!answer.trim() && !fileIds.length)}
                onClick={() => save('submitted')}
              >
                <Send size={16} />
                {h.data.status === 'submitted'
                  ? 'Обновить отправленную работу'
                  : 'Отправить работу'}
              </Button>
            </div>
          )}
          <FormError error={error} />
        </section>
      </div>
      {edit && <EntryEditor kind="homework" entry={h} onClose={() => setEdit(false)} />}{' '}
      {addBoard && (
        <AddToBoard fileId={addBoard} studentId={h.student_id} onClose={() => setAddBoard(null)} />
      )}
    </>
  );
}
function AddToBoard({
  fileId,
  studentId,
  onClose,
}: {
  fileId: string;
  studentId?: string | null;
  onClose: () => void;
}) {
  const { boards, refresh } = useApp(),
    navigate = useNavigate();
  const [id, setId] = useState('new'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Открыть материал на доске" onClose={onClose}>
      <Field label="Учебная доска">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="new">Создать новую доску</option>
          {boards
            .filter((b) => !b.archived)
            .map((b) => (
              <option value={b.id} key={b.id}>
                {b.title}
              </option>
            ))}
        </select>
      </Field>
      <p className="muted">
        PDF добавится отдельными страницами. Оригинальный файл сохранится, а пометки останутся
        отдельными объектами.
      </p>
      <FormError error={error} />
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              let boardId = id;
              if (id === 'new')
                boardId = (
                  await api<Board>('/boards', {
                    title: 'Разбор учебного материала',
                    studentId: studentId || null,
                  })
                ).id;
              await refresh();
              onClose();
              navigate(`/board/${boardId}?import=${fileId}`);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Открыть
          <ArrowRight size={17} />
        </Button>
      </div>
    </Modal>
  );
}
export function MaterialsPage() {
  const { records, user } = useApp();
  const [query, setQuery] = useState(''),
    [folder, setFolder] = useState('Все'),
    [edit, setEdit] = useState<Entry | null | undefined>(),
    [boardFile, setBoardFile] = useState<string | null>(null),
    [deletion, setDeletion] = useState<Entry | null>(null);
  const folders = ['Все', ...new Set(records.material.map((r) => r.data.folder))];
  const list = records.material.filter(
    (r) =>
      (folder === 'Все' || r.data.folder === folder) &&
      `${r.data.title} ${r.data.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHead
        eyebrow="ПОД РУКОЙ В НУЖНЫЙ МОМЕНТ"
        title="Библиотека материалов"
        description="Конспекты, рабочие листы и учебные тексты для ваших занятий."
        action={
          user.role === 'teacher' && (
            <Button onClick={() => setEdit(null)}>
              <Plus size={18} />
              Добавить материал
            </Button>
          )
        }
      />
      <div className="filter-bar">
        <div className="tabs scroll-tabs">
          {folders.map((f) => (
            <button key={f} className={folder === f ? 'active' : ''} onClick={() => setFolder(f)}>
              {f}
            </button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="Найти материал…" />
      </div>
      <div className="material-grid">
        {list.map((r) => (
          <article className="material-card" key={r.id}>
            <div className="material-icon">
              <FileText size={35} />
              <span>{r.data.folder}</span>
            </div>
            <div className="material-content">
              <div className="button-row space-between">
                <Badge tone={r.data.shared ? 'mint' : 'gray'}>
                  {r.data.shared ? 'Для учеников' : 'Личное'}
                </Badge>
                {user.role === 'teacher' && (
                  <div className="button-row">
                    <button
                      className="icon-btn"
                      aria-label="Редактировать материал"
                      onClick={() => setEdit(r)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Удалить материал"
                      onClick={() => setDeletion(r)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
              <h2>{r.data.title}</h2>
              <p className="muted clamp">{r.data.description || 'Учебный материал'}</p>
              <FileLinks ids={r.data.fileIds} />
              {user.role === 'teacher' && r.data.fileIds?.length > 0 && (
                <Button variant="secondary" onClick={() => setBoardFile(r.data.fileIds[0])}>
                  <PanelsTopLeft size={16} />
                  На доску
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!list.length && (
        <Empty
          icon={FolderOpen}
          title="Соберите свою библиотеку"
          text="Загружайте PDF и изображения, распределяйте по папкам и делитесь с учениками."
        />
      )}
      {edit !== undefined && (
        <EntryEditor kind="material" entry={edit || undefined} onClose={() => setEdit(undefined)} />
      )}{' '}
      {boardFile && <AddToBoard fileId={boardFile} onClose={() => setBoardFile(null)} />}{' '}
      {deletion && <DeleteEntry entry={deletion} onClose={() => setDeletion(null)} />}
    </>
  );
}
export function ProgressPage() {
  const { records, user, students } = useApp();
  const [sid, setSid] = useState(students[0]?.id || ''),
    [edit, setEdit] = useState<Entry | null | undefined>();
  const results = records.result
    .filter((r) => !sid || r.student_id === sid)
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
  const checked = records.homework.filter(
    (r) => r.data.status === 'reviewed' && (!sid || r.student_id === sid),
  );
  const points = results.map((r) => Math.round((r.data.score / r.data.maxScore) * 100));
  return (
    <>
      <PageHead
        eyebrow="КАЖДЫЙ ШАГ ИМЕЕТ ЗНАЧЕНИЕ"
        title="Диагностика и прогресс"
        description="Результаты работ помогают увидеть изменения и выбрать следующий шаг."
        action={
          user.role === 'teacher' && (
            <Button onClick={() => setEdit(null)}>
              <Plus size={18} />
              Добавить результат
            </Button>
          )
        }
      />
      {user.role === 'teacher' && (
        <div className="filter-bar">
          <StudentSelect optional value={sid} onChange={setSid} />
        </div>
      )}
      <div className="stats-grid progress-stats">
        <Metric title="Выполнено работ" value={String(results.length + checked.length)} />
        <Metric
          title="Навыков освоено"
          value={String(results.filter((r) => r.data.skill === 'mastered').length)}
        />
        <Metric
          title="Требуют повторения"
          value={String(results.filter((r) => r.data.skill === 'repeat').length)}
        />
        <Metric title="Последний результат" value={points.length ? `${points.at(-1)}%` : '—'} />
      </div>
      <div className="two-columns">
        <section className="panel">
          <SectionHeading title="Динамика результатов" subtitle="Доля набранных баллов, %" />
          {results.length ? (
            <div className="chart-wrap">
              <svg role="img" aria-label="График результатов по датам" viewBox="0 0 620 250">
                <title>Результаты работ в процентах</title>
                {[0, 25, 50, 75, 100].map((v) => (
                  <g key={v}>
                    <line x1="35" x2="600" y1={215 - v * 1.8} y2={215 - v * 1.8} stroke="#e9e8f0" />
                    <text x="4" y={220 - v * 1.8} fontSize="12" fill="#85859b">
                      {v}
                    </text>
                  </g>
                ))}
                <polyline
                  points={points
                    .map(
                      (v, i) =>
                        `${50 + i * (540 / Math.max(1, points.length - 1))},${215 - v * 1.8}`,
                    )
                    .join(' ')}
                  fill="none"
                  stroke="#6657ee"
                  strokeWidth="3"
                  strokeLinejoin="round"
                />
                {points.map((v, i) => (
                  <g key={i}>
                    <circle
                      cx={50 + i * (540 / Math.max(1, points.length - 1))}
                      cy={215 - v * 1.8}
                      r="5"
                      fill="#6657ee"
                    >
                      <title>
                        {results[i].data.title}: {v}%
                      </title>
                    </circle>
                    <text
                      x={50 + i * (540 / Math.max(1, points.length - 1))}
                      y="242"
                      textAnchor="middle"
                      fontSize="10"
                      fill="#85859b"
                    >
                      {date(results[i].data.date, { day: '2-digit', month: '2-digit' })}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <Empty icon={ChartNoAxesCombined} title="График начнётся с первой работы" />
          )}
        </section>
        <section className="panel">
          <SectionHeading title="Куда двигаться дальше" />
          {results
            .filter((r) => r.data.skill === 'repeat')
            .map((r) => (
              <div className="recommendation" key={r.id}>
                <span className="round-icon peach">
                  <Target size={18} />
                </span>
                <div>
                  <h3>{r.data.topic}</h3>
                  <p className="muted">
                    {r.data.recommendation || 'Вернуться к теме на следующем занятии.'}
                  </p>
                </div>
              </div>
            ))}
          {!results.filter((r) => r.data.skill === 'repeat').length && (
            <div className="mini-empty">
              <span className="round-icon mint">
                <TrendingUp size={22} />
              </span>
              <h3>Продолжаем движение</h3>
              <p className="muted">Темы для повторения появятся по результатам работ.</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel">
        <SectionHeading title="История работ" />
        {results.map((r) => (
          <div className="result-row" key={r.id}>
            <div>
              <strong>{r.data.title}</strong>
              <p className="muted">
                {date(r.data.date)} · {r.data.topic}
              </p>
              <p>{r.data.recommendation}</p>
            </div>
            <div className="result-actions">
              <Badge
                tone={
                  r.data.skill === 'mastered'
                    ? 'mint'
                    : r.data.skill === 'repeat'
                      ? 'peach'
                      : 'purple'
                }
              >
                {statusLabels[r.data.skill]}
              </Badge>
              <strong>
                {r.data.score}/{r.data.maxScore}
              </strong>
              {user.role === 'teacher' && (
                <button
                  className="icon-btn"
                  aria-label="Изменить результат"
                  onClick={() => setEdit(r)}
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {checked.map((r) => (
          <Link className="result-row" key={r.id} to={`/homework/${r.id}`}>
            <div>
              <strong>{r.data.title}</strong>
              <p className="muted">Домашняя работа</p>
            </div>
            <Badge tone="mint">
              {r.data.score ?? '✓'} / {r.data.maxScore}
            </Badge>
            <ArrowUpRight size={17} />
          </Link>
        ))}
        {!results.length && !checked.length && <Empty title="История пока пуста" />}
      </section>
      {user.role === 'student' && records.report.length > 0 && (
        <section className="panel">
          <SectionHeading title="Отчёты преподавателя" />
          {records.report.map((report) => (
            <details className="faq" key={report.id}>
              <summary>
                {report.data.title} · {report.data.month}
                <Plus size={18} />
              </summary>
              <h3>Итоги месяца</h3>
              <p className="pre-wrap">{report.data.summary}</p>
              <h3>Следующие шаги</h3>
              <p className="pre-wrap">{report.data.plan}</p>
            </details>
          ))}
        </section>
      )}
      {edit !== undefined && (
        <EntryEditor
          kind="result"
          entry={edit || undefined}
          studentId={sid || undefined}
          onClose={() => setEdit(undefined)}
        />
      )}
    </>
  );
}
function Metric({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description?: string;
}) {
  return (
    <div className="metric-card">
      <span className="muted">{title}</span>
      <strong>{value}</strong>
      {description && <small className="muted">{description}</small>}
    </div>
  );
}
export function ReportsPage() {
  const { records, studentName } = useApp();
  const [edit, setEdit] = useState<Entry | null | undefined>(),
    [print, setPrint] = useState<Entry | null>(null),
    [del, setDel] = useState<Entry | null>(null);
  return (
    <>
      <PageHead
        title="Ежемесячные отчёты"
        eyebrow="РЕЗУЛЬТАТЫ, КОТОРЫЕ ВИДНО"
        description="Соберите проведённые занятия, добавьте выводы и план следующего месяца."
        action={
          <Button onClick={() => setEdit(null)}>
            <Plus size={18} />
            Подготовить отчёт
          </Button>
        }
      />
      <div className="report-grid">
        {records.report.map((r) => (
          <section className="panel report-card" key={r.id}>
            <div className="button-row space-between">
              <span className="round-icon purple">
                <FileText size={22} />
              </span>
              <Badge tone={r.data.shared ? 'mint' : 'gray'}>
                {r.data.shared ? 'В кабинете ученика' : 'Личный'}
              </Badge>
            </div>
            <p className="eyebrow">{r.data.month}</p>
            <h2>{studentName(r.student_id)}</h2>
            <p className="muted clamp">{r.data.summary}</p>
            <div className="button-row">
              <Button variant="secondary" onClick={() => setEdit(r)}>
                <Pencil size={15} />
                Изменить
              </Button>
              <Button variant="secondary" onClick={() => setPrint(r)}>
                <Printer size={15} />
                PDF / печать
              </Button>
              <button className="icon-btn" aria-label="Удалить отчёт" onClick={() => setDel(r)}>
                <Trash2 size={16} />
              </button>
            </div>
          </section>
        ))}
      </div>
      {!records.report.length && (
        <Empty
          icon={FileText}
          title="Подведём итоги месяца"
          text="Автозаполнение использует проведённые уроки и результаты. Перед отправкой добавьте свой вывод."
        />
      )}
      {edit !== undefined && (
        <EntryEditor kind="report" entry={edit || undefined} onClose={() => setEdit(undefined)} />
      )}{' '}
      {print && (
        <Modal title="Отчёт готов к печати" wide onClose={() => setPrint(null)}>
          <article className="print-sheet">
            <span className="print-brand">основа.</span>
            <h1>{print.data.title}</h1>
            <p>
              {studentName(print.student_id)} · {print.data.month}
            </p>
            <h2>Итоги месяца</h2>
            <p className="pre-wrap">{print.data.summary}</p>
            <h2>Следующие шаги</h2>
            <p className="pre-wrap">{print.data.plan}</p>
          </article>
          <div className="form-actions screen-only">
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              Печать / сохранить в PDF
            </Button>
          </div>
        </Modal>
      )}{' '}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}
export function FinancesPage() {
  const { records, students, studentName } = useApp();
  const [edit, setEdit] = useState<Entry | null | undefined>(),
    [del, setDel] = useState<Entry | null>(null),
    [month, setMonth] = useState(localInput(new Date()).slice(0, 7));
  const transactions = records.transaction
    .filter((r) => localInput(r.data.date).startsWith(month))
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
  const income = transactions
      .filter((r) => r.data.type !== 'expense')
      .reduce((a, r) => a + r.data.amount, 0),
    expense = transactions
      .filter((r) => r.data.type === 'expense')
      .reduce((a, r) => a + r.data.amount, 0);
  const balances = students.map((s) => {
    const paid = records.transaction
      .filter((r) => r.student_id === s.id && r.data.type === 'payment')
      .reduce((a, r) => a + r.data.amount, 0);
    const charged = records.lesson
      .filter(
        (r) =>
          r.data.status === 'completed' &&
          (r.student_id === s.id || r.data.studentIds?.includes(s.id)),
      )
      .reduce((a, r) => a + r.data.price, 0);
    return { s, paid, charged, balance: paid - charged };
  });
  const forecast = records.lesson
    .filter(
      (r) =>
        ['planned', 'rescheduled'].includes(r.data.status) &&
        localInput(r.data.start).startsWith(month),
    )
    .reduce(
      (a, r) =>
        a +
        r.data.price *
          Math.max(1, new Set([r.student_id, ...r.data.studentIds].filter(Boolean)).size),
      0,
    );
  const csv = () => {
    const cell = (x: any) =>
      `"${String(x ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = [
      ['Дата', 'Тип', 'Ученик', 'Описание', 'Сумма'],
      ...transactions.map((r) => [
        date(r.data.date, { year: 'numeric' }),
        r.data.type === 'expense' ? 'Расход' : r.data.type === 'payment' ? 'Оплата' : 'Доход',
        r.student_id ? studentName(r.student_id) : '',
        r.data.title,
        r.data.amount,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(['\ufeff' + rows.map((row) => row.map(cell).join(';')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `osnova-finances-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <PageHead
        eyebrow="ПОНЯТНЫЙ УЧЁТ"
        title="Оплаты и финансы"
        description="Баланс ученика = оплаты минус стоимость проведённых занятий."
        action={
          <div className="button-row">
            <Button variant="secondary" onClick={csv}>
              <Download size={16} />
              CSV для Excel
            </Button>
            <Button onClick={() => setEdit(null)}>
              <Plus size={18} />
              Добавить операцию
            </Button>
          </div>
        }
      />
      <div className="filter-bar">
        <input
          aria-label="Финансовый месяц"
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
        />
        <small className="muted">Отменённые занятия не создают начислений.</small>
      </div>
      <div className="stats-grid">
        <Metric title="Поступления за месяц" value={money(income)} />
        <Metric title="Расходы" value={money(expense)} />
        <Metric title="Доход за вычетом расходов" value={money(income - expense)} />
        <Metric
          title="План по будущим урокам"
          value={money(forecast)}
          description="Прогноз, без начисления долга"
        />
      </div>
      <section className="panel">
        <SectionHeading
          title="Баланс по ученикам"
          subtitle="За всё время. Положительный баланс — аванс; отрицательный — к оплате."
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Оплачено</th>
                <th>Проведено на сумму</th>
                <th>Остаток / долг</th>
              </tr>
            </thead>
            <tbody>
              {balances.map(({ s, paid, charged, balance }) => (
                <tr key={s.id}>
                  <td>
                    <Link className="table-person" to={`/students/${s.id}`}>
                      <Avatar name={s.name} color={s.color} small />
                      {s.name}
                    </Link>
                  </td>
                  <td>{money(paid)}</td>
                  <td>{money(charged)}</td>
                  <td>
                    <Badge tone={balance < 0 ? 'peach' : balance > 0 ? 'mint' : 'gray'}>
                      {balance < 0 ? 'К оплате ' : balance > 0 ? 'Аванс ' : ''}
                      {money(Math.abs(balance))}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!balances.length && <Empty title="Добавьте ученика для учёта оплат" />}
      </section>
      <section className="panel">
        <SectionHeading title="История операций" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Дата</th>
                <th>Операция</th>
                <th>Ученик</th>
                <th>Сумма</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.map((r) => (
                <tr key={r.id}>
                  <td>{date(r.data.date)}</td>
                  <td>
                    <strong>{r.data.title}</strong>
                    <small className="table-subtitle">
                      {r.data.type === 'expense'
                        ? 'Расход'
                        : r.data.type === 'payment'
                          ? 'Оплата занятий'
                          : 'Прочий доход'}
                    </small>
                  </td>
                  <td>{r.student_id ? studentName(r.student_id) : '—'}</td>
                  <td className={r.data.type === 'expense' ? 'text-danger' : 'text-success'}>
                    {r.data.type === 'expense' ? '−' : '+'}
                    {money(r.data.amount)}
                  </td>
                  <td>
                    <div className="button-row">
                      <button
                        className="icon-btn"
                        aria-label="Изменить операцию"
                        onClick={() => setEdit(r)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Удалить операцию"
                        onClick={() => setDel(r)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!transactions.length && <Empty icon={Wallet} title="В этом месяце операций нет" />}
      </section>
      {edit !== undefined && (
        <EntryEditor
          kind="transaction"
          entry={edit || undefined}
          onClose={() => setEdit(undefined)}
        />
      )}{' '}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}
export function DocumentsPage() {
  const { records, studentName } = useApp();
  const [edit, setEdit] = useState<Entry | null | undefined>(),
    [query, setQuery] = useState(''),
    [del, setDel] = useState<Entry | null>(null);
  const types: Record<string, string> = {
    contract: 'Договор',
    consent: 'Согласие',
    invoice: 'Счёт',
    other: 'Другое',
  };
  const list = records.document.filter((r) =>
    `${r.data.title} ${studentName(r.student_id)}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHead
        title="Договоры и документы"
        eyebrow="ОРГАНИЗАЦИЯ БЕЗ ЛИШНИХ ПАПОК"
        description="Счета, договоры и согласия связаны с карточками учеников."
        action={
          <Button onClick={() => setEdit(null)}>
            <Plus size={18} />
            Добавить документ
          </Button>
        }
      />
      <div className="filter-bar">
        <SearchBox value={query} onChange={setQuery} placeholder="Найти документ или ученика…" />
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Документ</th>
                <th>Ученик</th>
                <th>Статус</th>
                <th>Файлы</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.data.title}</strong>
                    <small className="table-subtitle">{types[r.data.type]}</small>
                  </td>
                  <td>{r.student_id ? studentName(r.student_id) : 'Общие документы'}</td>
                  <td>
                    <Badge tone={r.data.status === 'signed' ? 'mint' : 'gray'}>
                      {statusLabels[r.data.status]}
                    </Badge>
                  </td>
                  <td>
                    <FileLinks ids={r.data.fileIds} />
                  </td>
                  <td>
                    <div className="button-row">
                      <button
                        className="icon-btn"
                        aria-label="Изменить документ"
                        onClick={() => setEdit(r)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label="Удалить документ"
                        onClick={() => setDel(r)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty
            icon={FileText}
            title="Документы всегда найдутся"
            text="Прикрепите несколько файлов к одному документу и укажите статус."
          />
        )}
      </section>
      {edit !== undefined && (
        <EntryEditor kind="document" entry={edit || undefined} onClose={() => setEdit(undefined)} />
      )}{' '}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}
export function TasksPage() {
  const { records, update, toast, studentName } = useApp();
  const [edit, setEdit] = useState<{ kind: 'task' | 'note'; entry?: Entry } | null>(null),
    [done, setDone] = useState(false),
    [del, setDel] = useState<Entry | null>(null);
  const tasks = records.task
    .filter((t) => t.data.done === done)
    .sort((a, b) => (a.data.due || 'z').localeCompare(b.data.due || 'z'));
  return (
    <>
      <PageHead
        title="Задачи и заметки"
        eyebrow="ОСВОБОДИМ МЕСТО ДЛЯ ГЛАВНОГО"
        description="Подготовка к урокам, важные дела и идеи, к которым хочется вернуться."
        action={
          <div className="button-row">
            <Button variant="secondary" onClick={() => setEdit({ kind: 'note' })}>
              <FileText size={16} />
              Заметка
            </Button>
            <Button onClick={() => setEdit({ kind: 'task' })}>
              <Plus size={18} />
              Задача
            </Button>
          </div>
        }
      />
      <div className="two-columns">
        <section className="panel">
          <div className="tabs">
            <button className={!done ? 'active' : ''} onClick={() => setDone(false)}>
              Предстоит
            </button>
            <button className={done ? 'active' : ''} onClick={() => setDone(true)}>
              Выполнено
            </button>
          </div>
          {tasks.map((t) => (
            <div className={`task-item ${done ? 'done' : ''}`} key={t.id}>
              <button
                aria-label={done ? 'Вернуть задачу' : 'Завершить задачу'}
                className="task-checkbox"
                onClick={async () => {
                  try {
                    await update(t, { done: !t.data.done });
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                {done && <Check size={16} />}
              </button>
              <button className="task-body" onClick={() => setEdit({ kind: 'task', entry: t })}>
                <strong>{t.data.title}</strong>
                {t.data.description && <p className="muted">{t.data.description}</p>}
                <small
                  className={
                    t.data.due && new Date(t.data.due).getTime() < Date.now() && !done
                      ? 'text-danger'
                      : 'muted'
                  }
                >
                  {t.data.due
                    ? date(t.data.due, { hour: '2-digit', minute: '2-digit' })
                    : 'Без срока'}
                  {t.student_id ? ` · ${studentName(t.student_id)}` : ''}
                </small>
              </button>
              <button className="icon-btn" aria-label="Удалить задачу" onClick={() => setDel(t)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!tasks.length && (
            <Empty
              icon={ClipboardCheck}
              title={done ? 'Завершённые дела появятся здесь' : 'Можно выдохнуть'}
              text="Здесь будут ваши рабочие задачи."
            />
          )}
        </section>
        <div>
          <SectionHeading title="Личные заметки" />
          {records.note.map((n) => (
            <article className="note-card" key={n.id}>
              <div className="button-row space-between">
                <h3>{n.data.title}</h3>
                <div className="button-row">
                  <button
                    className="icon-btn"
                    aria-label="Изменить заметку"
                    onClick={() => setEdit({ kind: 'note', entry: n })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Удалить заметку"
                    onClick={() => setDel(n)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="pre-wrap">{n.data.text}</p>
              <small className="muted">{date(n.updated_at)}</small>
            </article>
          ))}
          {!records.note.length && (
            <div className="note-card">
              <Sparkles size={24} />
              <h3>Хорошая идея не потеряется</h3>
              <p className="muted">Запишите наблюдение после урока или план будущего занятия.</p>
            </div>
          )}
        </div>
      </div>
      {edit && <EntryEditor kind={edit.kind} entry={edit.entry} onClose={() => setEdit(null)} />}{' '}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}
export function NotificationsPage() {
  const { records, update, refresh, toast } = useApp();
  const [onlyNew, setOnlyNew] = useState(false),
    [busy, setBusy] = useState(false);
  const list = records.notification.filter((n) => !onlyNew || !n.data.read);
  return (
    <>
      <PageHead
        title="Уведомления"
        eyebrow="НА СВЯЗИ С УЧЕБНЫМ ПРОЦЕССОМ"
        description="Уроки, новые работы и важные события в одном месте."
        action={
          <Button
            variant="secondary"
            disabled={busy || !records.notification.some((n) => !n.data.read)}
            onClick={async () => {
              setBusy(true);
              try {
                await Promise.all(
                  records.notification
                    .filter((n) => !n.data.read)
                    .map((n) =>
                      api(`/records/notification/${n.id}`, { data: { read: true } }, 'PATCH'),
                    ),
                );
                await refresh();
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Check size={17} />
            Прочитать все
          </Button>
        }
      />
      <div className="tabs page-tabs">
        <button className={!onlyNew ? 'active' : ''} onClick={() => setOnlyNew(false)}>
          Все события
        </button>
        <button className={onlyNew ? 'active' : ''} onClick={() => setOnlyNew(true)}>
          Непрочитанные<Badge>{records.notification.filter((n) => !n.data.read).length}</Badge>
        </button>
      </div>
      <section className="panel notification-feed">
        {list.map((n) => (
          <div className={`notification-item ${n.data.read ? '' : 'unread'}`} key={n.id}>
            <span className="round-icon purple">
              <Bell size={20} />
            </span>
            <div>
              <div className="button-row">
                <strong>{n.data.title}</strong>
                {!n.data.read && <span className="activity-dot" />}
              </div>
              <p>{n.data.message}</p>
              <small className="muted">
                {date(n.created_at, { hour: '2-digit', minute: '2-digit' })}
              </small>
              <Link
                className="text-link"
                to={n.data.path}
                onClick={() => {
                  if (!n.data.read) update(n, { read: true }).catch((e) => toast(e.message));
                }}
              >
                Открыть
                <ArrowRight size={14} />
              </Link>
            </div>
            {!n.data.read && (
              <button
                className="icon-btn"
                aria-label="Отметить прочитанным"
                onClick={() => update(n, { read: true }).catch((e) => toast(e.message))}
              >
                <Check size={17} />
              </button>
            )}
          </div>
        ))}
        {!list.length && (
          <Empty
            icon={Bell}
            title="Вы ничего не пропустили"
            text="Новые события появятся здесь автоматически."
          />
        )}
      </section>
    </>
  );
}
export function SettingsPage() {
  const { user, setUser, toast } = useApp();
  const [form, setForm] = useState({
      name: user.name,
      reminders: user.settings.reminders !== false,
      reminderMinutes: Number(user.settings.reminderMinutes || 30),
      quietStart: String(user.settings.quietStart || '22:00'),
      quietEnd: String(user.settings.quietEnd || '08:00'),
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [password, setPassword] = useState({ currentPassword: '', newPassword: '' }),
    [sessions, setSessions] = useState<any[]>([]);
  useEffect(() => {
    api('/auth/sessions')
      .then(setSessions)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageHead
        title="Настройки"
        eyebrow="ПРОСТРАНСТВО ПОД ВАС"
        description="Профиль, напоминания и доступ к вашему кабинету."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Профиль и напоминания</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const { name, ...settings } = form;
                setUser(await api('/me', { name, settings }, 'PATCH'));
                toast('Настройки сохранены');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Имя на уроке">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Почта для входа">
              <input value={user.email || 'Гостевой вход'} disabled />
            </Field>
            <label className="check-field">
              <input
                type="checkbox"
                checked={form.reminders}
                onChange={(e) => setForm({ ...form, reminders: e.target.checked })}
              />
              Напоминать о ближайших уроках
            </label>
            <Field label="За сколько минут">
              <select
                value={form.reminderMinutes}
                onChange={(e) => setForm({ ...form, reminderMinutes: Number(e.target.value) })}
              >
                {[5, 15, 30, 60, 120].map((v) => (
                  <option value={v} key={v}>
                    {v} минут
                  </option>
                ))}
              </select>
            </Field>
            <h3>Тихие часы · МСК</h3>
            <div className="form-grid">
              <Field label="С">
                <input
                  type="time"
                  required
                  value={form.quietStart}
                  onChange={(e) => setForm({ ...form, quietStart: e.target.value })}
                />
              </Field>
              <Field label="До">
                <input
                  type="time"
                  required
                  value={form.quietEnd}
                  onChange={(e) => setForm({ ...form, quietEnd: e.target.value })}
                />
              </Field>
            </div>
            <p className="muted small-text">
              Напоминания появляются в центре уведомлений на сайте. Если время начала и конца
              совпадает, тихие часы отключены.
            </p>
            <FormError error={error} />
            <SaveButton busy={busy} />
          </form>
        </section>
        <div>
          <section className="panel">
            <span className="round-icon mint">
              <ShieldCheck size={23} />
            </span>
            <h2>Безопасность</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError('');
                try {
                  await api('/auth/password', password);
                  setPassword({ currentPassword: '', newPassword: '' });
                  toast('Пароль изменён. Остальные сеансы завершены.');
                  setSessions(await api('/auth/sessions'));
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Текущий пароль">
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password.currentPassword}
                  onChange={(e) => setPassword({ ...password, currentPassword: e.target.value })}
                />
              </Field>
              <Field label="Новый пароль — от 10 символов">
                <input
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                  value={password.newPassword}
                  onChange={(e) => setPassword({ ...password, newPassword: e.target.value })}
                />
              </Field>
              <Button disabled={busy} variant="secondary" type="submit">
                Изменить пароль
              </Button>
            </form>
          </section>
          <section className="panel">
            <h2>Активные сеансы</h2>
            {sessions.map((s, i) => (
              <div className="session-row" key={i}>
                <div>
                  <strong>{s.current ? 'Этот сеанс' : 'Другой сеанс'}</strong>
                  <small className="muted">
                    Вход: {date(s.created_at, { hour: '2-digit', minute: '2-digit' })}
                  </small>
                </div>
                <Badge tone={s.current ? 'mint' : 'gray'}>{s.current ? 'Активен' : 'Открыт'}</Badge>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await api('/auth/revoke-other-sessions', {});
                  setSessions(await api('/auth/sessions'));
                  toast('Другие сеансы завершены');
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              Завершить другие сеансы
            </Button>
          </section>
        </div>
      </div>
    </>
  );
}
export function HelpPage({ onTour }: { onTour: () => void }) {
  const [query, setQuery] = useState('');
  const faq = [
    [
      'Как начать урок?',
      'Добавьте ученика и занятие в расписание. Откройте карточку занятия и нажмите «Открыть доску урока». Доску также можно создать отдельно в разделе «Доски».',
    ],
    [
      'Как пригласить ученика?',
      'В карточке ученика создайте приглашение в кабинет: оно действует 7 дней. Для разового доступа к доске нажмите «Пригласить» на самой доске, выберите просмотр или редактирование, срок и число участников. Приглашение можно отозвать.',
    ],
    [
      'Как работать с PDF?',
      'На доске выберите «Загрузить» и PDF. Каждая страница станет отдельной рабочей областью с закреплённым фоном. Пишите и рисуйте поверх. Поддерживаются PDF до 25 МБ и 30 страниц без пароля.',
    ],
    [
      'Сохраняются ли изменения автоматически?',
      'Да. Надпись «Сохранено» означает, что сервер подтвердил запись. При разрыве связи правки остаются в локальной очереди и отправляются после подключения. Не очищайте данные браузера, пока есть несохранённые изменения. При конфликте одного объекта можно скачать локальную версию.',
    ],
    [
      'Как подчеркнуть члены предложения?',
      'Панель «Русский язык» на доске добавляет прямую, двойную, волнистую, пунктирную и штрихпунктирную линии. Их можно перемещать и менять размер. Ручка и маркер подходят для морфем и орфограмм.',
    ],
    [
      'Как проверить домашнюю работу?',
      'Откройте «Задания», выберите работу со статусом «На проверке», напишите комментарий и поставьте баллы. Фотографии и PDF можно открыть на доске для пометок. Ученик увидит результат и получит уведомление.',
    ],
    [
      'Как считаются оплаты?',
      'Оплаты учеников создают аванс. Стоимость начисляется только после статуса «Проведён». Отменённые уроки не создают долг. Для мини-группы цена задаётся за одного ученика. План будущих занятий показан отдельно.',
    ],
    [
      'Как сохранить отчёт в PDF?',
      'Создайте отчёт за месяц и нажмите «Собрать по проведённым урокам». Допишите выводы и план. Откройте «PDF / печать» и выберите сохранение в PDF в диалоге браузера.',
    ],
    [
      'Есть ли видеосвязь?',
      'В этой версии видеосвязь не подключена. Доска и учебные процессы работают самостоятельно. Для разговора используйте отдельный привычный сервис.',
    ],
    [
      'Как восстановить страницу?',
      'На доске откройте «История». Преподавателю доступны последние 50 сохранённых версий каждой страницы. Перед восстановлением проверьте дату; текущая версия тоже попадёт в историю.',
    ],
  ];
  return (
    <>
      <PageHead
        title="Поможем освоиться"
        eyebrow="ВСЁ ПОНЯТНО С ПЕРВОГО УРОКА"
        description="Короткие ответы и знакомство с основными возможностями."
        action={
          <Button onClick={onTour}>
            <Sparkles size={17} />
            Пройти знакомство
          </Button>
        }
      />
      <div className="help-hero">
        <BookOpen size={40} />
        <div>
          <h2>Хороший урок начинается с простых действий</h2>
          <p>
            Создайте ученика → запланируйте урок → откройте доску → закрепите материал заданием.
          </p>
        </div>
      </div>
      <SearchBox value={query} onChange={setQuery} placeholder="Найти ответ…" />
      <section className="faq-list">
        {faq
          .filter(([q, a]) => (q + ' ' + a).toLowerCase().includes(query.toLowerCase()))
          .map(([q, a]) => (
            <details className="faq" key={q}>
              <summary>
                {q}
                <Plus size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
      </section>
    </>
  );
}
function DeleteEntry({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const { remove } = useApp();
  return (
    <Confirm
      title="Удалить запись?"
      text={`«${entry.data.title}» будет удалена. Прикреплённые исходные файлы останутся на сервере.`}
      onClose={onClose}
      onConfirm={() => remove(entry)}
    />
  );
}
