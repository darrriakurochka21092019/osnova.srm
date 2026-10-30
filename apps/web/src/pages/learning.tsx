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
import { Brand } from '../Brand';
import { HomeworkReview } from '../cabinet/Homework';
import { HelpLayout } from '../cabinet/Utility';
import { StatCard, WorkBadge, quantity } from '../cabinet/shared';
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

export { HomeworkPage } from '../cabinet/Homework';
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
  if (teacher) return <HomeworkReview key={h.id} entry={h} />;
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
          <WorkBadge entry={h} />
          <h2>Что нужно сделать</h2>
          <p className="pre-wrap assignment-instruction">
            {h.data.description || 'Инструкция не добавлена.'}
          </p>
          {h.data.status === 'assigned' && h.data.feedback && (
            <div className="feedback-box">
              <h3>Что исправить</h3>
              <p className="pre-wrap">{h.data.feedback}</p>
            </div>
          )}
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
export function AddToBoard({
  fileId,
  studentId,
  onClose,
}: {
  fileId: string;
  studentId?: string | null;
  onClose: () => void;
}) {
  const { classrooms, user } = useApp(),
    navigate = useNavigate();
  const eligible = classrooms.filter(
    (r) => !studentId || r.students.some((s) => s.id === studentId),
  );
  const [id, setId] = useState(
    eligible.find((r) => r.kind === 'individual')?.id || eligible[0]?.id || '',
  );
  return (
    <Modal title="Добавить материал к занятию" onClose={onClose}>
      <Field label="Учебная комната">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="" disabled>
            Выберите ученика или мини-группу
          </option>
          {eligible.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </Field>
      <p className="muted">
        Материал добавится на постоянную общую доску. PDF откроется одной презентацией с отдельными
        пометками для каждого слайда.
      </p>
      {!eligible.length && (
        <p className="muted">
          Сначала добавьте ученика: его учебная комната создастся автоматически.
        </p>
      )}
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Отмена
        </Button>
        <Button
          disabled={!id}
          onClick={() => {
            onClose();
            navigate(
              user.role === 'teacher' ? `/lesson/${id}/prepare?import=${fileId}` : `/lesson/${id}`,
            );
          }}
        >
          Открыть в комнате урока
          <ArrowRight size={17} />
        </Button>
      </div>
    </Modal>
  );
}

export { MaterialsPage } from '../cabinet/Library';

export function ProgressPage() {
  const { records, user, students } = useApp();
  const [sid, setSid] = useState(students[0]?.id || ''),
    [edit, setEdit] = useState<Entry | null | undefined>(),
    [month, setMonth] = useState('');
  const results = records.result
    .filter(
      (r) =>
        (!sid || r.student_id === sid) && (!month || localInput(r.data.date).startsWith(month)),
    )
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
  const checked = records.homework.filter(
    (r) =>
      r.data.status === 'reviewed' &&
      (!sid || r.student_id === sid) &&
      (!month || localInput(r.updated_at).startsWith(month)),
  );
  const skills = [...new Map(results.map((r) => [`${r.student_id}:${r.data.topic}`, r])).values()];
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
        <div className="cabinet-filters">
          <label aria-label="Выбрать ученика">
            <StudentSelect optional value={sid} onChange={setSid} />
          </label>
          <input
            aria-label="Месяц результатов"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <Button variant="secondary" onClick={() => setMonth('')}>
            За всё время
          </Button>
        </div>
      )}
      <div className="cabinet-stats">
        <StatCard
          icon={BookOpen}
          label="Освоено тем"
          value={`${skills.filter((r) => r.data.skill === 'mastered').length} из ${skills.length}`}
          hint="По последним результатам тем"
          tone="mint"
        />
        <StatCard
          icon={FileText}
          label="Последняя работа"
          value={
            results.length
              ? `${results.at(-1)!.data.score} из ${results.at(-1)!.data.maxScore}`
              : '—'
          }
          hint={results.at(-1)?.data.title || 'Добавьте первый результат'}
          tone="peach"
        />
        <StatCard
          icon={Target}
          label="Нужно повторить"
          value={quantity(skills.filter((r) => r.data.skill === 'repeat').length, [
            'тема',
            'темы',
            'тем',
          ])}
          hint={`${quantity(results.length + checked.length, ['работа', 'работы', 'работ'])} в истории`}
        />
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
          <SectionHeading title="Навыки" subtitle="Последний результат по каждой теме" />
          {skills.map((r) => (
            <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid #edf0f6' }}>
              <div className="button-row space-between">
                <strong>{r.data.topic}</strong>
                <Badge tone={r.data.skill === 'mastered' ? 'mint' : 'peach'}>
                  {statusLabels[r.data.skill]}
                </Badge>
              </div>
              <div className="cabinet-progress">
                <i
                  style={{
                    width: `${(100 * r.data.score) / r.data.maxScore}%`,
                    background: r.data.skill === 'mastered' ? '#13ae62' : '#ff8a32',
                  }}
                />
              </div>
              <small className="muted">
                {r.data.score} из {r.data.maxScore} · {r.data.recommendation}
              </small>
            </div>
          ))}
          {!skills.length && <Empty icon={TrendingUp} title="Начнём с первой работы" />}
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
              {report.data.strengths && (
                <>
                  <h3>Что получается</h3>
                  <p className="pre-wrap">{report.data.strengths}</p>
                </>
              )}
              {report.data.focus && (
                <>
                  <h3>Над чем работаем</h3>
                  <p className="pre-wrap">{report.data.focus}</p>
                </>
              )}
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
export { ReportsPage } from '../cabinet/Reports';

export function FinancesPage() {
  const { records, students, studentName } = useApp();
  const [edit, setEdit] = useState<Entry | null | undefined>(),
    [del, setDel] = useState<Entry | null>(null),
    [month, setMonth] = useState(localInput(new Date()).slice(0, 7)),
    [query, setQuery] = useState(''),
    [balanceStatus, setBalanceStatus] = useState(''),
    [tab, setTab] = useState('payments'),
    [history, setHistory] = useState('');
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
        title="Финансы"
        description={`${date(`${month}-01T12:00:00+03:00`, { day: undefined, month: 'long', year: 'numeric' })} · Время МСК`}
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
      <div className="cabinet-stats cabinet-stats-four">
        <StatCard
          icon={Wallet}
          label="Доходы"
          value={money(income)}
          hint="Оплаты и прочие поступления за месяц"
          tone="mint"
        />
        <StatCard
          icon={ArrowUpRight}
          label="Расходы"
          value={money(expense)}
          hint="Материалы и сервисы"
          tone="peach"
        />
        <StatCard
          icon={ChartNoAxesCombined}
          label="Итог"
          value={money(income - expense)}
          hint="Результат за месяц"
        />
        <StatCard
          icon={Clock3}
          label="Ожидают оплаты"
          value={money(balances.reduce((a, b) => a + Math.max(0, -b.balance), 0))}
          hint="Долги за проведённые занятия · всё время"
          tone="peach"
        />
      </div>
      <div className="tabs page-tabs">
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
          Оплаты учеников
        </button>
        <button
          className={tab === 'operations' ? 'active' : ''}
          onClick={() => setTab('operations')}
        >
          Доходы и расходы
        </button>
      </div>
      <p className="muted small-text">
        План будущих занятий на месяц: {money(forecast)}. Прогноз не начисляет долг.
      </p>
      {tab === 'payments' && (
        <section className="panel">
          <SectionHeading
            title="Оплаты учеников"
            subtitle="За всё время. Положительный баланс — аванс; отрицательный — к оплате."
          />
          <div className="cabinet-filters">
            <SearchBox value={query} onChange={setQuery} placeholder="Поиск ученика…" />
            <select
              aria-label="Статус оплаты"
              value={balanceStatus}
              onChange={(e) => setBalanceStatus(e.target.value)}
            >
              <option value="">Все статусы</option>
              <option value="debt">Нужна оплата</option>
              <option value="advance">Есть аванс</option>
              <option value="zero">Нулевой баланс</option>
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ученик</th>
                  <th>Оплачено</th>
                  <th>Проведено на сумму</th>
                  <th>Остаток / долг</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {balances
                  .filter(
                    ({ s, balance }) =>
                      s.name.toLowerCase().includes(query.toLowerCase()) &&
                      (!balanceStatus ||
                        (balanceStatus === 'debt'
                          ? balance < 0
                          : balanceStatus === 'advance'
                            ? balance > 0
                            : balance === 0)),
                  )
                  .map(({ s, paid, charged, balance }) => (
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
                      <td>
                        <Button variant="secondary" onClick={() => setHistory(s.id)}>
                          История
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!balances.length && <Empty title="Добавьте ученика для учёта оплат" />}
        </section>
      )}
      <section className="panel">
        <SectionHeading title={tab === 'payments' ? 'Последние операции' : 'Доходы и расходы'} />
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
      {history && (
        <Modal title={`История оплат · ${studentName(history)}`} onClose={() => setHistory('')}>
          <div className="list-links">
            {records.transaction
              .filter((r) => r.student_id === history)
              .sort((a, b) => b.data.date.localeCompare(a.data.date))
              .map((r) => (
                <div className="cabinet-mini-row" key={r.id}>
                  <FileText size={18} />
                  <div>
                    <strong>{r.data.title}</strong>
                    <small>{date(r.data.date)}</small>
                  </div>
                  <strong className={r.data.type === 'expense' ? 'text-danger' : 'text-success'}>
                    {r.data.type === 'expense' ? '−' : '+'}
                    {money(r.data.amount)}
                  </strong>
                </div>
              ))}
          </div>
          {!records.transaction.some((r) => r.student_id === history) && (
            <Empty title="Операций пока нет" />
          )}
        </Modal>
      )}
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
export { DocumentsPage } from '../cabinet/Library';

export { TasksPage } from '../cabinet/Tasks';

export { NotificationsPage, SettingsPage } from '../cabinet/Utility';

export function HelpPage({ onTour }: { onTour: () => void }) {
  const [query, setQuery] = useState('');
  const faq = [
    [
      'Как начать урок?',
      'Добавьте ученика — его постоянная комната с доской появится автоматически. Запланируйте занятие и нажмите «Войти на урок» в расписании, на главной или в карточке ученика. Материалы можно подготовить заранее.',
    ],
    [
      'Как пригласить ученика?',
      'В карточке ученика скопируйте «Ссылку на занятия» и отправьте её один раз. Она работает для следующих индивидуальных уроков и мини-групп. Ученику достаточно указать имя и дождаться преподавателя. Для домашних заданий и личного расписания можно отдельно настроить кабинет ученика; приглашение для его активации действует 7 дней.',
    ],
    [
      'Как работать с PDF?',
      'Выберите «Загрузить PDF или изображение». PDF станет одной презентацией на общем холсте. Выделите презентацию и переключайте слайды кнопками или списком прямо под ней: пометки сохраняются отдельно для каждого слайда. Презентацию можно перемещать и менять её размер. Поддерживаются PDF до 25 МБ и 30 слайдов без пароля.',
    ],
    [
      'Сохраняются ли изменения автоматически?',
      'Да. Надпись «Сохранено» означает, что сервер подтвердил запись. При разрыве связи правки остаются в локальной очереди и отправляются после подключения. Не очищайте данные браузера, пока есть несохранённые изменения. При конфликте одного объекта можно скачать локальную версию.',
    ],
    [
      'Подходит ли доска для разных предметов?',
      'Да. На общем холсте можно размещать тексты, изображения и схемы. Для ручки и маркера доступны любой цвет и ползунок толщины. В «Фигурах» есть плоские фигуры и редактируемые проекции объёмных тел. В «Линиях» — варианты подчёркиваний для русского языка. Доступны пять шрифтов, стандартные размеры и замочек у любого выделенного объекта. Закреплённый объект можно выбрать на холсте и открепить. Фигуры и линии рисуются протягиванием мыши, доска перемещается зажатой правой кнопкой. Есть цветные стикеры и готовые формулы по математике, физике и химии. Фон можно выбрать: белый холст, клетка, линии или точки.',
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
      'Как восстановить холст?',
      'В меню урока откройте «История уроков». Сначала просмотрите сохранённую версию, затем восстановите её при необходимости. Контрольные версии начала и завершения занятий сохраняются отдельно от последних 50 обычных сохранений. Материалы завершённого занятия также доступны в его итогах.',
    ],
  ];
  return <HelpLayout faq={faq} onTour={onTour} />;
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
