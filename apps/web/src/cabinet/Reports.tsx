import { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  CalendarDays,
  FileText,
  Plus,
  Printer,
  Save,
  Target,
  TrendingUp,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Entry, Student } from '../../../../packages/contracts';
import { date, localInput } from '../api';
import { useApp } from '../store';
import { Avatar, Badge, Button, Empty, Field, FormError, Modal, PageHead } from '../ui';
import { Brand } from '../Brand';
import { DeleteEntry, Menu, StatCard } from './shared';

function reportData(
  student: Student,
  month: string,
  records: ReturnType<typeof useApp>['records'],
) {
  const lessons = records.lesson.filter(
    (r) =>
      (r.student_id === student.id || r.data.studentIds?.includes(student.id)) &&
      r.data.status === 'completed' &&
      localInput(r.data.start).startsWith(month),
  );
  const works = records.homework.filter(
    (r) =>
      r.student_id === student.id &&
      r.data.status === 'reviewed' &&
      localInput(r.updated_at).startsWith(month),
  );
  const results = records.result.filter(
    (r) => r.student_id === student.id && localInput(r.data.date).startsWith(month),
  );
  const topics = [...new Set(lessons.map((r) => r.data.title))];
  return {
    lessons,
    works,
    results,
    summary: topics.join('; '),
    strengths: results
      .filter((r) => r.data.skill === 'mastered')
      .map((r) => `${r.data.topic}${r.data.recommendation ? `. ${r.data.recommendation}` : ''}`)
      .join('\n'),
    focus: results
      .filter((r) => r.data.skill !== 'mastered')
      .map((r) => `${r.data.topic}${r.data.recommendation ? `. ${r.data.recommendation}` : ''}`)
      .join('\n'),
    plan: results
      .filter((r) => r.data.skill === 'repeat')
      .map((r) => `Повторить: ${r.data.topic}`)
      .join('\n'),
  };
}
export function ReportsPage() {
  const { students, records } = useApp();
  const [month, setMonth] = useState(localInput(new Date()).slice(0, 7)),
    [filter, setFilter] = useState(''),
    [sid, setSid] = useState(students[0]?.id || ''),
    [reportId, setReportId] = useState('');
  const people = students.filter((s) => !filter || s.id === filter),
    selected = people.find((s) => s.id === sid) || people[0];
  const reports = records.report.filter((r) => r.data.month === month);
  const versions = reports.filter((r) => r.student_id === selected?.id);
  const current =
    reportId === 'new' ? undefined : versions.find((r) => r.id === reportId) || versions[0];
  return (
    <>
      <PageHead
        title="Ежемесячные отчёты"
        description="Итоги обучения по каждому ученику за месяц"
        action={
          <Button disabled={!selected} onClick={() => setReportId('new')}>
            <Plus size={18} />
            Новый отчёт
          </Button>
        }
      />
      <div className="cabinet-filters">
        <input
          aria-label="Отчётный месяц"
          type="month"
          value={month}
          onChange={(e) => {
            if (e.target.value) setMonth(e.target.value);
            setReportId('');
          }}
        />
        <select
          aria-label="Ученик в отчётах"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setReportId('');
          }}
        >
          <option value="">Все ученики</option>
          {students.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {selected ? (
        <div className="cabinet-reports">
          <section className="panel" style={{ padding: 10 }}>
            {people.map((s) => {
              const r = reports.find((r) => r.student_id === s.id);
              return (
                <button
                  key={s.id}
                  className={`cabinet-report-person ${selected.id === s.id ? 'active' : ''}`}
                  onClick={() => {
                    setSid(s.id);
                    setReportId('');
                  }}
                >
                  <Avatar name={s.name} color={s.color} />
                  <div>
                    <strong>
                      {s.name} · {s.grade}
                    </strong>
                    <small>
                      {date(`${month}-01T12:00:00+03:00`, {
                        day: undefined,
                        month: 'long',
                        year: 'numeric',
                      })}
                    </small>
                  </div>
                  <Badge tone={r?.data.shared ? 'mint' : r ? 'peach' : 'gray'}>
                    {r?.data.shared ? 'Готов' : r ? 'Черновик' : 'Не создан'}
                  </Badge>
                </button>
              );
            })}
          </section>
          <div>
            {versions.length > 0 && (
              <Field label="Отчёты за месяц">
                <select value={current?.id || 'new'} onChange={(e) => setReportId(e.target.value)}>
                  {versions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.data.title}
                    </option>
                  ))}
                  <option value="new">Новый отчёт</option>
                </select>
              </Field>
            )}
            <ReportEditor
              key={`${selected.id}:${month}:${current?.id || 'new'}`}
              student={selected}
              month={month}
              entry={current}
              onSaved={setReportId}
            />
          </div>
        </div>
      ) : (
        <Empty
          icon={FileText}
          title="Сначала добавьте ученика"
          text="Отчёт собирается из его занятий и результатов."
        />
      )}
    </>
  );
}
function ReportEditor({
  student,
  month,
  entry,
  onSaved,
}: {
  student: Student;
  month: string;
  entry?: Entry;
  onSaved: (id: string) => void;
}) {
  const { records, create, update } = useApp(),
    generated = reportData(student, month, records);
  const [form, setForm] = useState({
      title: entry?.data.title || `${student.name} · ${month}`,
      summary: entry?.data.summary || '',
      strengths: entry?.data.strengths || '',
      focus: entry?.data.focus || '',
      plan: entry?.data.plan || '',
      shared: entry?.data.shared || false,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [print, setPrint] = useState(false),
    [del, setDel] = useState(false);
  const fields = [
    ['summary', 'Что изучили', BookOpen],
    ['strengths', 'Что получается', CheckCircle2],
    ['focus', 'Над чем работаем', TrendingUp],
    ['plan', 'План на следующий месяц', Target],
  ] as const;
  return (
    <section className="panel cabinet-report-editor">
      <div className="section-heading">
        <span className="eyebrow">ОТЧЁТ ОБ ОБУЧЕНИИ</span>
        <div className="button-row">
          <Badge tone={entry?.data.shared ? 'mint' : 'peach'}>
            {entry?.data.shared ? 'В кабинете ученика' : entry ? 'Черновик' : 'Новый отчёт'}
          </Badge>
          {entry && (
            <Menu label="Действия с отчётом">
              <button className="text-danger" onClick={() => setDel(true)}>
                <Trash2 size={15} />
                Удалить отчёт
              </button>
            </Menu>
          )}
        </div>
      </div>
      <h2>
        {student.name} ·{' '}
        {date(`${month}-01T12:00:00+03:00`, { day: undefined, month: 'long', year: 'numeric' })}
      </h2>
      <p className="muted">{[student.grade, student.subject].filter(Boolean).join(' · ')}</p>
      <div className="cabinet-stats">
        <StatCard
          icon={CalendarDays}
          label="занятий"
          value={generated.lessons.length}
          tone="blue"
        />
        <StatCard
          icon={FileText}
          label="работ проверено"
          value={generated.works.length}
          tone="peach"
        />
        <StatCard
          icon={BookOpen}
          label="тем изучили"
          value={new Set(generated.lessons.map((l) => l.data.title)).size}
          tone="mint"
        />
      </div>
      <Button
        variant="secondary"
        onClick={() =>
          setForm({
            ...form,
            summary: generated.summary,
            strengths: generated.strengths,
            focus: generated.focus,
            plan: generated.plan,
          })
        }
      >
        <Pencil size={16} />
        Собрать по проведённым урокам
      </Button>
      <form
        style={{ marginTop: 16 }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            const data = { ...form, month };
            const saved = entry
              ? await update(entry, data, student.id)
              : await create('report', data, student.id);
            onSaved(saved.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Название отчёта">
          <input
            required
            maxLength={250}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        {fields.map(([key, label, Icon]) => (
          <Field label={label} key={key}>
            <textarea
              rows={2}
              maxLength={20000}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </Field>
        ))}
        <label className="check-field">
          <input
            type="checkbox"
            checked={form.shared}
            onChange={(e) => setForm({ ...form, shared: e.target.checked })}
          />
          Показать в кабинете ученика
        </label>
        <FormError error={error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={() => setPrint(true)}>
            <Printer size={16} />
            Предпросмотр / PDF
          </Button>
          <Button type="submit" disabled={busy}>
            <Save size={16} />
            {busy ? 'Сохраняем…' : entry ? 'Сохранить отчёт' : 'Создать отчёт'}
          </Button>
        </div>
      </form>
      {print && (
        <Modal title="Отчёт готов к печати" wide onClose={() => setPrint(false)}>
          <article className="print-sheet">
            <Brand />
            <h1>{form.title}</h1>
            <p>
              {student.name} · {month}
            </p>
            <p>
              Проведено занятий: {generated.lessons.length}. Проверено работ:{' '}
              {generated.works.length}.
            </p>
            {fields.map(([key, label]) => (
              <section key={key}>
                <h2>{label}</h2>
                <p className="pre-wrap">{form[key] || '—'}</p>
              </section>
            ))}
          </article>
          <div className="form-actions screen-only">
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              Печать / сохранить в PDF
            </Button>
          </div>
        </Modal>
      )}
      {del && entry && <DeleteEntry entry={entry} onClose={() => setDel(false)} />}
    </section>
  );
}
