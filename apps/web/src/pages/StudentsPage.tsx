import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowDownUp,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleMinus,
  Clock3,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import type { Classroom, Entry, Student } from '../../../../packages/contracts';
import { api, date, localInput } from '../api';
import { useApp } from '../store';
import { Avatar, Button, Confirm, Empty } from '../ui';
import { StudentEditor } from './editors';
import { LessonDialog } from './workspace';
import { groupPrograms, homeworkLabels, studentHomework, upcomingLesson } from './students-data';
import './students.css';

type Tab = 'students' | 'groups' | 'archive';
type SortKey = 'name' | 'program' | 'next' | 'homework' | 'status';
const PAGE_SIZE = 5;
const russian = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const isExam = (program: string) => /огэ|егэ|экзамен/i.test(program);

function lessonDate(lesson: Entry, now: number) {
  const time = localInput(lesson.data.start).slice(11, 16);
  const day = localInput(lesson.data.start).slice(0, 10);
  const current = localInput(new Date(now)).slice(0, 10);
  const tomorrow = localInput(new Date(now + 86_400_000)).slice(0, 10);
  return `${day === current ? 'Сегодня' : day === tomorrow ? 'Завтра' : date(lesson.data.start, { month: 'short' }).replace('.', '')}, ${time} МСК`;
}

export function StudentsPage() {
  const { students, records, classrooms, refresh, toast } = useApp();
  const [tab, setTab] = useState<Tab>('students');
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('');
  const [program, setProgram] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean } | null>(null);
  const [editor, setEditor] = useState<Student | 'new' | null>(null);
  const [lesson, setLesson] = useState<Entry | null>(null);
  const [menu, setMenu] = useState<{ student: Student; target: HTMLButtonElement } | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [statusChange, setStatusChange] = useState<{
    students: Student[];
    status: 'active' | 'paused';
  } | null>(null);
  const [now, setNow] = useState(Date.now);
  const checkAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const grades = [...new Set(students.map((student) => student.grade).filter(Boolean))].sort(
    russian.compare,
  );
  const programs = [
    ...new Set(students.map((student) => student.program.trim()).filter(Boolean)),
  ].sort(russian.compare);
  const active = students.filter((student) => student.status === 'active');
  const groups = classrooms.filter((room) => room.kind === 'group');
  const matchesPupil = (student: Student) =>
    (!grade || student.grade === grade) && (!program || student.program.trim() === program);
  const search = query.trim().toLocaleLowerCase('ru');
  const nextFor = (student: Student) =>
    upcomingLesson(
      records.lesson,
      (entry) => entry.student_id === student.id || entry.data.studentIds?.includes(student.id),
      now,
    );
  const nextForGroup = (room: Classroom) =>
    upcomingLesson(records.lesson, (entry) => entry.data.classroomId === room.id, now);
  const pupils = students.filter(
    (student) =>
      student.status === (tab === 'archive' ? 'paused' : 'active') &&
      matchesPupil(student) &&
      student.name.toLocaleLowerCase('ru').includes(search),
  );
  const sortValue = (student: Student) => {
    switch (sort?.key) {
      case 'program':
        return student.program;
      case 'next':
        return nextFor(student) ? new Date(nextFor(student)!.data.start).toISOString() : '9999';
      case 'homework': {
        const homework = studentHomework(records.homework, student.id);
        return homework ? homeworkLabels[homework.data.status] : 'Нет заданий';
      }
      case 'status':
        return student.status;
      default:
        return student.name;
    }
  };
  if (sort)
    pupils.sort((a, b) => russian.compare(sortValue(a), sortValue(b)) * (sort.descending ? -1 : 1));
  const filteredGroups = groups.filter((room) => {
    const members = students.filter((student) =>
      room.students.some((member) => member.id === student.id),
    );
    return (
      members.some(matchesPupil) &&
      `${room.title} ${members.map((student) => student.name).join(' ')}`
        .toLocaleLowerCase('ru')
        .includes(search)
    );
  });
  const pages = Math.max(1, Math.ceil(pupils.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const shown = pupils.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const allChecked = shown.length > 0 && shown.every((student) => checked.includes(student.id));
  useEffect(() => {
    if (checkAll.current)
      checkAll.current.indeterminate =
        !allChecked && shown.some((student) => checked.includes(student.id));
  }, [allChecked, checked, shown]);
  const resetSelection = () => {
    setPage(0);
    setChecked([]);
    setMenu(null);
  };
  const selectTab = (value: Tab) => {
    setTab(value);
    resetSelection();
  };
  const changeSort = (key: SortKey) => {
    setSort({ key, descending: sort?.key === key && !sort.descending });
    setPage(0);
  };

  const changeStatus = async () => {
    if (!statusChange) return;
    const results = await Promise.allSettled(
      statusChange.students.map((student) =>
        api(`/students/${student.id}`, { status: statusChange.status }, 'PATCH'),
      ),
    );
    await refresh();
    setChecked([]);
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length)
      throw new Error(
        `Не удалось изменить статус ${failed.length} из ${results.length} учеников. Попробуйте ещё раз.`,
      );
    toast(
      statusChange.status === 'paused' ? 'Ученики перемещены в архив' : 'Ученики снова занимаются',
    );
    setStatusChange(null);
  };
  const sortHeading = (key: SortKey, title: string) => (
    <th
      scope="col"
      aria-sort={sort?.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}
    >
      <button onClick={() => changeSort(key)}>
        {title}
        <ArrowDownUp size={12} />
      </button>
    </th>
  );

  return (
    <div className="students-page">
      <div className="students-heading">
        <div>
          <h1>Ученики</h1>
          <p>Индивидуальные занятия и мини-группы</p>
        </div>
        <svg
          className="students-hero-book"
          viewBox="0 0 410 245"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="student-book-purple" x2="1" y2="1">
              <stop stopColor="#d1c3ff" />
              <stop offset="1" stopColor="#ad95ff" />
            </linearGradient>
            <linearGradient id="student-book-lime" x2="1" y2="1">
              <stop stopColor="#e7ffae" />
              <stop offset="1" stopColor="#cdff5c" />
            </linearGradient>
          </defs>
          <path
            fill="url(#student-book-purple)"
            d="M0 0h185c43 47 40 142 57 245-47-59-128-59-179-91C30 133 19 68 0 0Z"
          />
          <path
            fill="url(#student-book-lime)"
            d="M410 0c-8 59-2 102-37 136-29 28-94 43-131 109 8-68 3-140 35-180C312 23 365 14 410 0Z"
          />
        </svg>
        <Button onClick={() => setEditor('new')}>
          <Plus size={25} />
          Добавить ученика
        </Button>
      </div>

      <div
        className="students-tabs"
        role="tablist"
        aria-label="Разделы учеников"
        onKeyDown={(e) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault();
          const tabs: Tab[] = ['students', 'groups', 'archive'];
          const current = tabs.indexOf(tab);
          const index =
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? 2
                : (current + (e.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
          selectTab(tabs[index]);
          e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus();
        }}
      >
        <button
          role="tab"
          id="students-tab"
          aria-controls="students-panel"
          aria-selected={tab === 'students'}
          tabIndex={tab === 'students' ? 0 : -1}
          onClick={() => selectTab('students')}
        >
          Ученики <span>{active.length}</span>
        </button>
        <button
          role="tab"
          id="groups-tab"
          aria-controls="students-panel"
          aria-selected={tab === 'groups'}
          tabIndex={tab === 'groups' ? 0 : -1}
          onClick={() => selectTab('groups')}
        >
          Мини-группы <span>{groups.length}</span>
        </button>
        <button
          role="tab"
          id="archive-tab"
          aria-controls="students-panel"
          aria-selected={tab === 'archive'}
          tabIndex={tab === 'archive' ? 0 : -1}
          onClick={() => selectTab('archive')}
        >
          Архив
        </button>
      </div>
      <div className="students-filters">
        <label className="students-search">
          <Search size={23} />
          <input
            aria-label="Имя ученика"
            placeholder={tab === 'groups' ? 'Название группы или имя ученика' : 'Имя ученика'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              resetSelection();
            }}
          />
          {query && (
            <button
              aria-label="Очистить поиск"
              onClick={() => {
                setQuery('');
                resetSelection();
              }}
            >
              <X size={17} />
            </button>
          )}
        </label>
        <label className="students-select">
          <select
            aria-label="Класс"
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              resetSelection();
            }}
          >
            <option value="">Все классы</option>
            {grades.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <ChevronDown size={18} />
        </label>
        <label className="students-select">
          <select
            aria-label="Программа"
            value={program}
            onChange={(e) => {
              setProgram(e.target.value);
              resetSelection();
            }}
          >
            <option value="">Все программы</option>
            {programs.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <ChevronDown size={18} />
        </label>
      </div>

      <div
        role="tabpanel"
        id="students-panel"
        aria-labelledby={`${tab === 'students' ? 'students' : tab === 'groups' ? 'groups' : 'archive'}-tab`}
      >
        {tab !== 'groups' ? (
          <>
            {checked.length > 0 && (
              <div className="students-selection" role="status">
                <span>Выбрано: {checked.length}</span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setStatusChange({
                      students: students.filter((student) => checked.includes(student.id)),
                      status: tab === 'archive' ? 'active' : 'paused',
                    })
                  }
                >
                  {tab === 'archive' ? <RotateCcw size={16} /> : <Archive size={16} />}
                  {tab === 'archive' ? 'Вернуть из архива' : 'В архив'}
                </Button>
                <button className="text-link" onClick={() => setChecked([])}>
                  Снять выделение
                </button>
              </div>
            )}
            <div className="students-table-panel">
              <div
                className="students-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Таблица учеников"
              >
                <table className="students-table" aria-label="Список учеников">
                  <thead>
                    <tr>
                      <th className="students-check" scope="col">
                        <input
                          ref={checkAll}
                          type="checkbox"
                          aria-label="Выбрать всех на странице"
                          checked={allChecked}
                          disabled={!shown.length}
                          onChange={(e) =>
                            setChecked(
                              e.target.checked
                                ? [...new Set([...checked, ...shown.map((student) => student.id)])]
                                : checked.filter(
                                    (id) => !shown.some((student) => student.id === id),
                                  ),
                            )
                          }
                        />
                      </th>
                      {sortHeading('name', 'Ученик')}
                      {sortHeading('program', 'Программа')}
                      {sortHeading('next', 'Следующий урок')}
                      {sortHeading('homework', 'Домашняя работа')}
                      {sortHeading('status', 'Статус')}
                      <th scope="col">
                        <span className="students-sr-only">Карточка ученика</span>
                      </th>
                      <th scope="col">
                        <span className="students-sr-only">Действия</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((student) => {
                      const next = nextFor(student);
                      const homework = studentHomework(records.homework, student.id);
                      const homeworkState = homework?.data.status || 'none';
                      const HomeworkIcon =
                        homeworkState === 'submitted'
                          ? Clock3
                          : homeworkState === 'reviewed'
                            ? CircleCheck
                            : homeworkState === 'none'
                              ? CircleMinus
                              : FileText;
                      const ProgramIcon = isExam(student.program) ? FileText : BookOpen;
                      return (
                        <tr key={student.id}>
                          <td className="students-check">
                            <input
                              type="checkbox"
                              aria-label={`Выбрать ученика: ${student.name}`}
                              checked={checked.includes(student.id)}
                              onChange={(e) =>
                                setChecked(
                                  e.target.checked
                                    ? [...checked, student.id]
                                    : checked.filter((id) => id !== student.id),
                                )
                              }
                            />
                          </td>
                          <th scope="row">
                            <Link to={`/students/${student.id}`} className="students-pupil">
                              <Avatar name={student.name} color={student.color} />
                              <span>
                                <strong>{student.name}</strong>
                                <small>{student.grade || 'Класс не указан'}</small>
                              </span>
                            </Link>
                          </th>
                          <td>
                            <div
                              className={`students-program ${isExam(student.program) ? 'exam' : ''}`}
                            >
                              <span className="students-program-icon">
                                <ProgramIcon size={23} />
                              </span>
                              <span className="students-ellipsis" title={student.program}>
                                {student.program || 'Программа не указана'}
                              </span>
                            </div>
                          </td>
                          <td>
                            {next ? (
                              <button
                                className="students-next"
                                aria-label={`Открыть урок: ${next.data.title}`}
                                onClick={() => setLesson(next)}
                              >
                                <CalendarDays size={23} />
                                <span>{lessonDate(next, now)}</span>
                              </button>
                            ) : (
                              <span className="students-no-lesson">
                                <CalendarDays size={23} />
                                Не запланирован
                              </span>
                            )}
                          </td>
                          <td>
                            {homework ? (
                              <Link
                                to={`/homework/${homework.id}`}
                                className={`students-homework ${homeworkState}`}
                              >
                                <HomeworkIcon size={20} />
                                {homeworkLabels[homeworkState]}
                              </Link>
                            ) : (
                              <span className="students-homework none">
                                <HomeworkIcon size={20} />
                                Нет заданий
                              </span>
                            )}
                          </td>
                          <td>
                            <span className={`students-status ${student.status}`}>
                              <i />
                              {student.status === 'active' ? 'Учится' : 'На паузе'}
                            </span>
                          </td>
                          <td>
                            <Link className="students-card-link" to={`/students/${student.id}`}>
                              Карточка
                              <ArrowRight size={16} />
                            </Link>
                          </td>
                          <td className="students-actions-cell">
                            <button
                              className="icon-btn"
                              aria-label={`Действия: ${student.name}`}
                              aria-haspopup="menu"
                              aria-expanded={menu?.student.id === student.id}
                              onClick={(e) =>
                                setMenu(
                                  menu?.student.id === student.id
                                    ? null
                                    : { student, target: e.currentTarget },
                                )
                              }
                            >
                              <MoreVertical size={22} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!shown.length && (
                <Empty
                  icon={Users}
                  title={
                    query || grade || program
                      ? 'Ученики не найдены'
                      : tab === 'archive'
                        ? 'Архив пока пуст'
                        : 'Здесь появятся ваши ученики'
                  }
                  text={
                    query || grade || program
                      ? 'Попробуйте изменить поиск или фильтры.'
                      : tab === 'archive'
                        ? 'Здесь хранятся карточки учеников, занятия с которыми на паузе.'
                        : 'Добавьте первого ученика, чтобы планировать занятия и следить за результатами.'
                  }
                  action={
                    tab === 'students' && !students.length ? (
                      <Button onClick={() => setEditor('new')}>
                        <Plus size={18} />
                        Добавить ученика
                      </Button>
                    ) : undefined
                  }
                />
              )}
              <div className="students-table-footer">
                <span>
                  Показано {shown.length} из {pupils.length} учеников
                </span>
                {pages > 1 && (
                  <div className="students-pagination">
                    <button
                      aria-label="Предыдущая страница учеников"
                      disabled={currentPage === 0}
                      onClick={() => {
                        setPage(currentPage - 1);
                        setMenu(null);
                      }}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span>
                      {currentPage + 1} / {pages}
                    </span>
                    <button
                      aria-label="Следующая страница учеников"
                      disabled={currentPage + 1 === pages}
                      onClick={() => {
                        setPage(currentPage + 1);
                        setMenu(null);
                      }}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {tab !== 'archive' && (
          <section className="students-groups-panel" aria-label="Мини-группы">
            <div className="students-groups-heading">
              <h2>
                Мини-группы <span>{groups.length}</span>
              </h2>
              {tab === 'students' && (
                <button onClick={() => selectTab('groups')}>
                  Все мини-группы
                  <ChevronRight size={19} />
                </button>
              )}
            </div>
            {filteredGroups.length ? (
              <div className="students-groups-grid">
                {(tab === 'students' ? filteredGroups.slice(0, 2) : filteredGroups).map(
                  (room, index) => (
                    <GroupCard
                      key={room.id}
                      room={room}
                      next={nextForGroup(room)}
                      programs={groupPrograms(room, students)}
                      now={now}
                      green={index % 2 === 1}
                    />
                  ),
                )}
              </div>
            ) : (
              <Empty
                icon={Users}
                title={
                  search || grade || program ? 'Мини-группы не найдены' : 'Мини-групп пока нет'
                }
                text={
                  search || grade || program
                    ? 'Попробуйте изменить поиск или фильтры.'
                    : 'Добавьте участников мини-группы при планировании урока — общая комната появится здесь.'
                }
              />
            )}
          </section>
        )}
      </div>

      {editor && (
        <StudentEditor
          student={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
      {lesson && <LessonDialog entry={lesson} onClose={() => setLesson(null)} />}
      {menu && (
        <StudentMenu
          student={menu.student}
          target={menu.target}
          onClose={() => setMenu(null)}
          onEdit={() => {
            setEditor(menu.student);
            setMenu(null);
          }}
          onStatus={() => {
            setStatusChange({
              students: [menu.student],
              status: menu.student.status === 'active' ? 'paused' : 'active',
            });
            setMenu(null);
          }}
        />
      )}
      {statusChange && (
        <Confirm
          title={statusChange.status === 'paused' ? 'Переместить в архив?' : 'Вернуть к занятиям?'}
          text={
            statusChange.status === 'paused'
              ? 'История уроков, задания и материалы сохранятся. Вход выбранных учеников в кабинет и на занятия будет приостановлен.'
              : 'Карточки вернутся в список учеников. Вход в личный кабинет снова станет доступен.'
          }
          onConfirm={changeStatus}
          onClose={() => setStatusChange(null)}
        />
      )}
    </div>
  );
}

function GroupCard({
  room,
  next,
  programs,
  now,
  green,
}: {
  room: Classroom;
  next?: Entry;
  programs: string[];
  now: number;
  green: boolean;
}) {
  const count = room.students.length;
  const noun =
    count % 10 === 1 && count % 100 !== 11
      ? 'ученик'
      : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)
        ? 'ученика'
        : 'учеников';
  return (
    <Link
      className={`students-group-card ${green ? 'green' : ''}`}
      to={`/lesson/${room.id}${next ? `?lesson=${next.id}` : ''}`}
    >
      <span className="students-group-icon">
        <Users size={29} />
      </span>
      <div className="students-group-info">
        <h3>{room.title}</h3>
        <p>
          {count} {noun} <span>·</span>{' '}
          {programs.length === 1
            ? programs[0]
            : programs.length > 1
              ? 'Разные программы'
              : 'Программа не указана'}
        </p>
      </div>
      <div className="students-group-next">
        <CalendarDays size={23} />
        <div>
          <span>Следующий урок</span>
          <small>{next ? lessonDate(next, now) : 'Не запланирован'}</small>
        </div>
      </div>
      <ChevronRight size={21} />
    </Link>
  );
}

function StudentMenu({
  student,
  target,
  onClose,
  onEdit,
  onStatus,
}: {
  student: Student;
  target: HTMLButtonElement;
  onClose: () => void;
  onEdit: () => void;
  onStatus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const menu = ref.current!;
    const reposition = () => {
      const box = target.getBoundingClientRect();
      const scroller = target.closest('.students-table-scroll')?.getBoundingClientRect();
      if (
        box.bottom <= 60 ||
        box.top >= innerHeight ||
        (scroller && (box.right <= scroller.left || box.left >= scroller.right))
      ) {
        onClose();
        return;
      }
      setPosition({
        top: Math.max(8, Math.min(box.bottom + 5, innerHeight - menu.offsetHeight - 12)),
        left: Math.max(
          12,
          Math.min(box.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 12),
        ),
      });
    };
    reposition();
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!menu.contains(e.target as Node) && !target.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      if (menu.contains(document.activeElement)) target.focus({ preventScroll: true });
    };
  }, [target]);
  return createPortal(
    <div
      className="students-row-menu"
      role="menu"
      aria-label={`Действия: ${student.name}`}
      ref={ref}
      style={position}
      onKeyDown={(e) => {
        const items = [...ref.current!.querySelectorAll<HTMLButtonElement>('button')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'Escape' || e.key === 'Tab') onClose();
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          items[
            e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
      }}
    >
      <button role="menuitem" onClick={onEdit}>
        <Pencil size={17} />
        Изменить
      </button>
      <button role="menuitem" onClick={onStatus}>
        {student.status === 'active' ? <Archive size={17} /> : <RotateCcw size={17} />}
        {student.status === 'active' ? 'В архив' : 'Вернуть из архива'}
      </button>
    </div>,
    document.body,
  );
}
