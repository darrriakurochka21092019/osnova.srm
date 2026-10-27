import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarDays,
  Copy,
  FolderOpen,
  PanelsTopLeft,
  Play,
  Plus,
  Users,
} from 'lucide-react';
import { useApp } from '../store';
import { Avatar, Badge, Button, Empty, PageHead, SearchBox, Modal } from '../ui';
import { date } from '../api';
import { EntryEditor } from '../pages/editors';
import { copyLessonLink, PersonalRoomLinks } from './shared';
import type { Classroom } from '../../../../packages/contracts';

export default function ClassroomsPage() {
  const { user, classrooms, toast } = useApp();
  const [query, setQuery] = useState(''),
    [tab, setTab] = useState('all'),
    [plan, setPlan] = useState(false);
  const [links, setLinks] = useState<Classroom | null>(null);
  const teacher = user.role === 'teacher';
  const rooms = classrooms.filter(
    (r) =>
      (tab === 'all' || r.kind === tab) &&
      `${r.title} ${r.students.map((s) => s.name).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHead
        title={teacher ? 'Уроки' : 'Мои занятия'}
        description={
          teacher
            ? 'Ученики, подготовка и вход на занятие — в одном месте.'
            : 'Ваша постоянная комната, общая доска и материалы занятий.'
        }
        action={
          teacher ? (
            <Button onClick={() => setPlan(true)}>
              <Plus size={18} />
              Запланировать урок
            </Button>
          ) : undefined
        }
      />
      <section className="classrooms-intro">
        <div className="classrooms-intro-icon">
          <PanelsTopLeft size={30} />
        </div>
        <div>
          <h2>Одна комната — все ваши занятия</h2>
          <p>
            {teacher
              ? 'Комната и доска создаются вместе с учеником. Ссылку достаточно отправить один раз.'
              : 'Здесь всегда та же доска: материалы предыдущих уроков остаются на ней.'}
          </p>
        </div>
        <span className="classroom-intro-badge">
          <span />
          Всё в одном кабинете
        </span>
      </section>
      <div className="classrooms-filter">
        <div className="tabs">
          {[
            ['all', 'Все комнаты'],
            ['individual', 'Индивидуальные'],
            ['group', 'Мини-группы'],
          ].map(([id, label]) => (
            <button key={id} className={id === tab ? 'active' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <SearchBox value={query} onChange={setQuery} placeholder="Найти ученика или группу" />
      </div>
      <div className="classrooms-grid">
        {rooms.map((room) => (
          <article className="classroom-card" key={room.id}>
            <div className="classroom-card-top">
              <div className="classroom-card-avatars">
                {room.students.slice(0, 3).map((s) => (
                  <Avatar key={s.id} name={s.name} color={s.color} />
                ))}
              </div>
              <Badge tone={room.activeSession ? 'mint' : 'purple'}>
                {room.activeSession
                  ? 'Идёт занятие'
                  : room.kind === 'group'
                    ? 'Мини-группа'
                    : 'Индивидуально'}
              </Badge>
            </div>
            <h2>{room.title}</h2>
            <p className="muted">
              {room.students
                .map((s) => [s.subject, s.grade].filter(Boolean).join(' · '))
                .filter((s, i, a) => a.indexOf(s) === i)
                .join(' / ') || 'Учебная комната'}
            </p>
            <div className="classroom-next">
              <CalendarDays size={18} />
              <div>
                <strong>
                  {room.activeSession?.title ||
                    room.lesson?.data.title ||
                    'Комната готова к занятию'}
                </strong>
                <small>
                  {room.lesson
                    ? `${date(room.lesson.data.start, { hour: '2-digit', minute: '2-digit' })} МСК · ${room.lesson.data.duration} минут`
                    : 'Можно заранее подготовить материалы на доске'}
                </small>
              </div>
            </div>
            <Link className="btn btn-primary classroom-enter" to={`/lesson/${room.id}`}>
              <Play size={17} />
              {room.activeSession ? 'Продолжить урок' : 'Войти на урок'}
              <ArrowRight size={17} />
            </Link>
            {!!room.sessions.some((s) => s.ended_at) && (
              <div className="classroom-recent-lessons">
                <small>Прошлые занятия</small>
                {room.sessions
                  .filter((s) => s.ended_at)
                  .slice(0, 2)
                  .map((s) => (
                    <Link key={s.id} to={`/lesson/${room.id}/summary/${s.id}`}>
                      <span>{s.title}</span>
                      <small>{date(s.started_at)}</small>
                      <ArrowRight size={15} />
                    </Link>
                  ))}
              </div>
            )}
            {teacher && (
              <div className="classroom-card-actions">
                <Link to={`/lesson/${room.id}/prepare`}>
                  <PanelsTopLeft size={16} />
                  Подготовить доску
                </Link>
                <button
                  onClick={async () => {
                    if (room.kind === 'group') {
                      setLinks(room);
                      return;
                    }
                    try {
                      await copyLessonLink(room.link!);
                      toast('Постоянная ссылка на занятия скопирована');
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  <Copy size={16} />
                  {room.kind === 'group' ? 'Ссылки ученикам' : 'Ссылка ученику'}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {!rooms.length && (
        <Empty
          icon={Users}
          title={
            query
              ? 'Ничего не найдено'
              : teacher
                ? 'Добавьте первого ученика'
                : 'Комната пока не появилась'
          }
          text={
            teacher
              ? 'Его учебная комната и доска создадутся автоматически.'
              : 'Откройте постоянную ссылку, которую прислал преподаватель.'
          }
          action={
            teacher ? (
              <Link className="btn btn-primary" to="/students">
                К ученикам
                <ArrowRight size={17} />
              </Link>
            ) : undefined
          }
        />
      )}
      {teacher && (
        <Link className="classroom-material-archive" to="/boards">
          <FolderOpen size={19} />
          <span>Материалы и прежние доски</span>
          <ArrowRight size={17} />
        </Link>
      )}
      {plan && <EntryEditor kind="lesson" onClose={() => setPlan(false)} />}
      {links && (
        <Modal title="Ссылки участникам мини-группы" onClose={() => setLinks(null)}>
          <PersonalRoomLinks room={links} />
        </Modal>
      )}
    </>
  );
}
