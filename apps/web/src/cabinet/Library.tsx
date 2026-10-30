import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  FileText,
  FolderOpen,
  PanelsTopLeft,
  Pencil,
  Trash2,
  LockKeyhole,
  LayoutGrid,
  List,
  Upload,
  ArrowRight,
} from 'lucide-react';
import type { Entry } from '../../../../packages/contracts';
import { date } from '../api';
import { useApp } from '../store';
import { Badge, Button, Empty, Modal, PageHead, SearchBox } from '../ui';
import { EntryEditor } from '../pages/editors';
import { AddToBoard } from '../pages/learning';
import { DeleteEntry, FilePreview, Menu, Privacy, quantity } from './shared';

export function MaterialsPage() {
  const { records, user } = useApp(),
    teacher = user.role === 'teacher';
  const [query, setQuery] = useState(''),
    [folder, setFolder] = useState(''),
    [view, setView] = useState('grid'),
    [edit, setEdit] = useState<Entry | null | undefined>(),
    [preview, setPreview] = useState<Entry | null>(null),
    [board, setBoard] = useState<string | null>(null),
    [del, setDel] = useState<Entry | null>(null);
  const folders = [...new Set(records.material.map((r) => r.data.folder))].filter(Boolean),
    list = records.material
      .filter(
        (m) =>
          (!folder || m.data.folder === folder) &&
          `${m.data.title} ${m.data.description} ${m.data.folder}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <>
      <PageHead
        title="Учебные материалы"
        description="Конспекты, рабочие листы и материалы уроков"
        action={
          teacher && (
            <Button onClick={() => setEdit(null)}>
              <Upload size={18} />
              Загрузить
            </Button>
          )
        }
      />
      <div className="cabinet-filters cabinet-toolbar">
        <SearchBox value={query} onChange={setQuery} placeholder="Название, тема или папка" />
        <div className="button-row">
          <Button
            variant={view === 'grid' ? 'primary' : 'secondary'}
            aria-label="Материалы плиткой"
            onClick={() => setView('grid')}
          >
            <LayoutGrid size={18} />
          </Button>
          <Button
            variant={view === 'list' ? 'primary' : 'secondary'}
            aria-label="Материалы списком"
            onClick={() => setView('list')}
          >
            <List size={18} />
          </Button>
        </div>
      </div>
      <div className="cabinet-materials">
        <aside className="cabinet-folders">
          <button className={!folder ? 'active' : ''} onClick={() => setFolder('')}>
            <FolderOpen size={21} />
            Все материалы
          </button>
          {folders.map((f) => (
            <button className={folder === f ? 'active' : ''} key={f} onClick={() => setFolder(f)}>
              <FolderOpen size={19} />
              {f}
            </button>
          ))}
        </aside>
        <div>
          <p className="muted" style={{ margin: '4px 0 15px' }}>
            Все материалы{' '}
            {folder && (
              <>
                {' '}
                / <strong>{folder}</strong>
              </>
            )}
          </p>
          <div className={`cabinet-material-grid ${view === 'list' ? 'is-list' : ''}`}>
            {list.map((m) => (
              <article className="cabinet-material-card" key={m.id}>
                <div className="cabinet-material-art">
                  <button
                    aria-label={`Открыть материал: ${m.data.title}`}
                    onClick={() => setPreview(m)}
                  >
                    <FileText />
                  </button>
                  {teacher && (
                    <Menu label={`Действия с материалом: ${m.data.title}`}>
                      <button onClick={() => setEdit(m)}>
                        <Pencil size={15} />
                        Редактировать материал
                      </button>
                      {m.data.fileIds?.length > 0 && (
                        <button onClick={() => setBoard(m.data.fileIds[0])}>
                          <PanelsTopLeft size={15} />
                          Добавить на доску
                        </button>
                      )}
                      <button className="text-danger" onClick={() => setDel(m)}>
                        <Trash2 size={15} />
                        Удалить материал
                      </button>
                    </Menu>
                  )}
                </div>
                <div>
                  <button className="text-button" onClick={() => setPreview(m)}>
                    <h3>{m.data.title}</h3>
                  </button>
                  <div className="button-row">
                    <Badge>{m.data.folder}</Badge>
                    <Badge tone={m.data.shared ? 'mint' : 'gray'}>
                      {m.data.shared ? 'Для учеников' : 'Личное'}
                    </Badge>
                  </div>
                  <p className="muted clamp small-text">
                    {m.data.description ||
                      quantity(m.data.fileIds?.length || 0, ['файл', 'файла', 'файлов'])}
                  </p>
                  <div className="cabinet-material-footer">
                    <span>Обновлено {date(m.updated_at, { day: 'numeric', month: 'short' })}</span>
                    {teacher && (
                      <button onClick={() => setEdit(m)}>
                        <LockKeyhole size={14} />
                        Доступ
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!list.length && (
            <section className="panel">
              <Empty
                icon={FolderOpen}
                title={
                  records.material.length ? 'Материалы не найдены' : 'Соберите свою библиотеку'
                }
                text="Загружайте PDF и изображения, распределяйте по папкам и делитесь с учениками."
              />
            </section>
          )}
        </div>
      </div>
      {edit !== undefined && (
        <EntryEditor kind="material" entry={edit || undefined} onClose={() => setEdit(undefined)} />
      )}
      {board && <AddToBoard fileId={board} onClose={() => setBoard(null)} />}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
      {preview && (
        <Modal title={preview.data.title} wide onClose={() => setPreview(null)}>
          <p className="pre-wrap">{preview.data.description}</p>
          <FilePreview ids={preview.data.fileIds || []} />
          {teacher && preview.data.fileIds?.length > 0 && (
            <div className="form-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  setBoard(preview.data.fileIds[0]);
                  setPreview(null);
                }}
              >
                <PanelsTopLeft size={16} />
                На доску
              </Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

const docTypes: Record<string, string> = {
  contract: 'Договоры',
  consent: 'Согласия',
  invoice: 'Счета',
  other: 'Другие',
};
export function DocumentsPage() {
  const { records, students, studentName } = useApp(),
    [search] = useSearchParams();
  const [query, setQuery] = useState(''),
    [type, setType] = useState(''),
    [sid, setSid] = useState(search.get('student') || ''),
    [selected, setSelected] = useState(''),
    [edit, setEdit] = useState<Entry | null | undefined>(),
    [del, setDel] = useState<Entry | null>(null),
    [archive, setArchive] = useState(false);
  const list = records.document.filter(
    (d) =>
      (archive ? d.data.status === 'archived' : d.data.status !== 'archived') &&
      (!sid || d.student_id === sid) &&
      (!type || d.data.type === type) &&
      `${d.data.title} ${studentName(d.student_id)}`.toLowerCase().includes(query.toLowerCase()),
  );
  const document = list.find((d) => d.id === selected) || list[0];
  return (
    <>
      <PageHead
        title="Договоры и документы"
        description="Файлы учеников и документы преподавателя"
        action={
          <Button onClick={() => setEdit(null)}>
            <Plus size={18} />
            Добавить документ
          </Button>
        }
      />
      <div className="cabinet-filters">
        <SearchBox value={query} onChange={setQuery} placeholder="Название или ученик" />
        <select
          aria-label="Ученик в документах"
          value={sid}
          onChange={(e) => setSid(e.target.value)}
        >
          <option value="">Все ученики</option>
          {students.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select aria-label="Тип документа" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Все типы</option>
          {Object.entries(docTypes).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="tabs page-tabs">
        <button
          className={!type && !archive ? 'active' : ''}
          onClick={() => {
            setType('');
            setArchive(false);
          }}
        >
          Все
        </button>
        {Object.entries(docTypes)
          .slice(0, 3)
          .map(([v, n]) => (
            <button
              key={v}
              className={type === v && !archive ? 'active' : ''}
              onClick={() => {
                setType(v);
                setArchive(false);
              }}
            >
              {n}
            </button>
          ))}
        <button
          className={archive ? 'active' : ''}
          onClick={() => {
            setType('');
            setArchive(true);
          }}
        >
          Архив
        </button>
      </div>
      <div className="cabinet-grid cabinet-documents">
        <div>
          <div className="cabinet-doc-folders">
            {Object.entries(docTypes)
              .slice(0, 3)
              .map(([v, n], i) => (
                <button
                  key={v}
                  onClick={() => {
                    setType(v);
                    setArchive(false);
                  }}
                >
                  <span className={`round-icon ${['blue', 'peach', 'mint'][i]}`}>
                    <FolderOpen size={25} />
                  </span>
                  <span>
                    <strong>{n}</strong>
                    <small>
                      {
                        records.document.filter(
                          (d) => d.data.type === v && d.data.status !== 'archived',
                        ).length
                      }{' '}
                      файлов
                    </small>
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
          </div>
          <section className="panel table-panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Ученик</th>
                    <th>Дата</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((d) => (
                    <tr key={d.id} className={document?.id === d.id ? 'is-selected' : ''}>
                      <td>
                        <button
                          className="text-button table-person"
                          onClick={() => setSelected(d.id)}
                        >
                          <FileText size={23} />
                          <strong>{d.data.title}</strong>
                        </button>
                      </td>
                      <td>{d.student_id ? studentName(d.student_id) : 'Общий документ'}</td>
                      <td className="muted">
                        {date(d.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td>
                        <Badge tone={d.data.status === 'signed' ? 'mint' : 'purple'}>
                          {d.data.status === 'signed'
                            ? 'Подписан'
                            : d.data.status === 'archived'
                              ? 'В архиве'
                              : 'Черновик'}
                        </Badge>
                      </td>
                      <td>
                        <Menu label={`Действия с документом: ${d.data.title}`}>
                          <button onClick={() => setEdit(d)}>
                            <Pencil size={15} />
                            Изменить документ
                          </button>
                          <button className="text-danger" onClick={() => setDel(d)}>
                            <Trash2 size={15} />
                            Удалить документ
                          </button>
                        </Menu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!list.length && (
              <Empty
                icon={FileText}
                title="Документов пока нет"
                text="Прикрепите файлы и свяжите документ с учеником."
              />
            )}
          </section>
          <Privacy>Доступ к документам ограничен преподавателем</Privacy>
        </div>
        <section className="panel">
          {document ? (
            <FilePreview
              key={document.id}
              ids={document.data.fileIds || []}
              title={document.data.title}
            />
          ) : (
            <Empty title="Выберите документ" />
          )}
        </section>
      </div>
      {edit !== undefined && (
        <EntryEditor kind="document" entry={edit || undefined} onClose={() => setEdit(undefined)} />
      )}
      {del && <DeleteEntry entry={del} onClose={() => setDel(null)} />}
    </>
  );
}
