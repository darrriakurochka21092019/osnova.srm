import { useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, FileText, FolderOpen, Plus, Trash2 } from 'lucide-react';
import {
  curriculumSchema,
  type CurriculumTopic,
  type Entry,
  type Student,
  type StudentCurriculum,
} from '../../../../packages/contracts';
import { api } from '../api';
import { useApp } from '../store';
import { Button, Field, FormError, Modal } from '../ui';
import { importProgramText } from './individual-program-data';

export function ProgramEditor({
  student,
  materials,
  onClose,
}: {
  student: Student;
  materials: Entry[];
  onClose: () => void;
}) {
  const { refresh, toast } = useApp();
  const [program, setProgram] = useState<StudentCurriculum>(() =>
    structuredClone(
      student.curriculum || { version: 1, lessonsPerWeek: null, duration: null, blocks: [] },
    ),
  );
  const [goal, setGoal] = useState(student.goal);
  const [text, setText] = useState(student.program);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const changeBlock = (id: string, patch: Partial<StudentCurriculum['blocks'][number]>) =>
    setProgram((old) => ({
      ...old,
      blocks: old.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)),
    }));
  const changeTopic = (blockId: string, id: string, patch: Partial<CurriculumTopic>) =>
    setProgram((old) => ({
      ...old,
      blocks: old.blocks.map((block) =>
        block.id === blockId
          ? {
              ...block,
              topics: block.topics.map((topic) =>
                topic.id === id ? { ...topic, ...patch } : topic,
              ),
            }
          : block,
      ),
    }));
  const moveBlock = (index: number, direction: number) =>
    setProgram((old) => {
      const blocks = [...old.blocks];
      [blocks[index], blocks[index + direction]] = [blocks[index + direction], blocks[index]];
      return { ...old, blocks };
    });
  const moveTopic = (blockId: string, index: number, direction: number) =>
    setProgram((old) => ({
      ...old,
      blocks: old.blocks.map((block) => {
        if (block.id !== blockId) return block;
        const topics = [...block.topics];
        [topics[index], topics[index + direction]] = [topics[index + direction], topics[index]];
        return { ...block, topics };
      }),
    }));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const checked = curriculumSchema.safeParse(program);
    if (!checked.success) {
      setError(`Проверьте программу: ${checked.error.issues[0].message}`);
      return;
    }
    setBusy(true);
    saving.current = true;
    try {
      await api(
        `/students/${student.id}`,
        { goal, program: text, curriculum: checked.data },
        'PATCH',
      );
      await refresh();
      toast('Программа сохранена');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Редактировать программу"
      onClose={() => {
        if (!saving.current) onClose();
      }}
      wide
      className="ip-editor-modal"
    >
      <form className="ip-editor" onSubmit={save}>
        <fieldset className="ip-editor-fields" disabled={busy}>
          <Field label="Цель обучения">
            <textarea
              value={goal}
              maxLength={20000}
              rows={2}
              onChange={(e) => setGoal(e.target.value)}
            />
          </Field>
          <div className="ip-editor-mode">
            <Field label="Занятий в неделю">
              <select
                value={program.lessonsPerWeek ?? ''}
                onChange={(e) =>
                  setProgram({
                    ...program,
                    lessonsPerWeek: e.target.value ? Number(e.target.value) : null,
                  })
                }
              >
                <option value="">Не указано</option>
                {[1, 2, 3, 4, 5, 6, 7].map((number) => (
                  <option value={number} key={number}>
                    {number}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Продолжительность, минут">
              <input
                type="number"
                min={15}
                max={240}
                value={program.duration ?? ''}
                placeholder="Не указано"
                onChange={(e) =>
                  setProgram({
                    ...program,
                    duration: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
          </div>
          <details className="ip-editor-description">
            <summary>Описание и прежний текст программы</summary>
            <Field label="Описание программы">
              <textarea
                value={text}
                maxLength={20000}
                rows={5}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            {text.trim() && !program.blocks.length && (
              <>
                <p>
                  Для импорта отделите разделы пустой строкой. В каждом разделе первая строка —
                  название, остальные — темы.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProgram({ ...program, blocks: importProgramText(text) })}
                >
                  <FileText size={17} />
                  Создать разделы из текста
                </Button>
              </>
            )}
          </details>
          <p className="ip-editor-hint">
            Статус «По результатам» обновляется по последней работе с тем же названием темы. При
            необходимости выберите статус вручную.
          </p>
          <div className="ip-editor-blocks">
            {program.blocks.map((block, index) => (
              <section
                className="ip-editor-block"
                key={block.id}
                aria-label={`Раздел ${index + 1}`}
              >
                <div className="ip-editor-block-heading">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <Field label={`Название раздела ${index + 1}`}>
                    <input
                      value={block.title}
                      required
                      maxLength={250}
                      placeholder="Например, Синтаксис"
                      onChange={(e) => changeBlock(block.id, { title: e.target.value })}
                    />
                  </Field>
                  <div className="ip-editor-order">
                    <button
                      type="button"
                      aria-label={`Поднять раздел ${index + 1}`}
                      disabled={!index}
                      onClick={() => moveBlock(index, -1)}
                    >
                      <ArrowUp size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Опустить раздел ${index + 1}`}
                      disabled={index === program.blocks.length - 1}
                      onClick={() => moveBlock(index, 1)}
                    >
                      <ArrowDown size={17} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Удалить раздел ${index + 1}`}
                      onClick={() =>
                        setProgram({
                          ...program,
                          blocks: program.blocks.filter((item) => item.id !== block.id),
                        })
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
                {block.topics.map((topic, position) => (
                  <div className="ip-editor-topic" key={topic.id}>
                    <div className="ip-editor-topic-fields">
                      <span>
                        {index + 1}.{position + 1}
                      </span>
                      <Field label={`Тема ${index + 1}.${position + 1}`}>
                        <input
                          value={topic.title}
                          required
                          maxLength={250}
                          placeholder="Название темы"
                          onChange={(e) =>
                            changeTopic(block.id, topic.id, { title: e.target.value })
                          }
                        />
                      </Field>
                      <Field label={`Статус темы ${index + 1}.${position + 1}`}>
                        <select
                          value={topic.status}
                          onChange={(e) =>
                            changeTopic(block.id, topic.id, {
                              status: e.target.value as CurriculumTopic['status'],
                            })
                          }
                        >
                          <option value="auto">По результатам</option>
                          <option value="planned">Запланировано</option>
                          <option value="learning">Сейчас изучаем</option>
                          <option value="mastered">Освоено</option>
                        </select>
                      </Field>
                      <div className="ip-editor-order">
                        <button
                          type="button"
                          aria-label={`Поднять тему ${index + 1}.${position + 1}`}
                          disabled={!position}
                          onClick={() => moveTopic(block.id, position, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Опустить тему ${index + 1}.${position + 1}`}
                          disabled={position === block.topics.length - 1}
                          onClick={() => moveTopic(block.id, position, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Удалить тему ${index + 1}.${position + 1}`}
                          onClick={() =>
                            changeBlock(block.id, {
                              topics: block.topics.filter((item) => item.id !== topic.id),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="ip-pick-button"
                      aria-expanded={picking === topic.id}
                      onClick={() => {
                        setPicking(picking === topic.id ? null : topic.id);
                        setQuery('');
                      }}
                    >
                      <FolderOpen size={16} />
                      Материалы к теме
                      {topic.materialIds.length ? ` · ${topic.materialIds.length}` : ''}
                      <ChevronDown size={15} />
                    </button>
                    {picking === topic.id && (
                      <div className="ip-material-picker">
                        <input
                          aria-label="Поиск материалов к теме"
                          placeholder="Найти материал"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        {materials
                          .filter((item) =>
                            item.data.title
                              .toLocaleLowerCase('ru')
                              .includes(query.trim().toLocaleLowerCase('ru')),
                          )
                          .map((item) => (
                            <label key={item.id}>
                              <input
                                type="checkbox"
                                checked={topic.materialIds.includes(item.id)}
                                disabled={
                                  !topic.materialIds.includes(item.id) &&
                                  topic.materialIds.length >= 20
                                }
                                onChange={(e) =>
                                  changeTopic(block.id, topic.id, {
                                    materialIds: e.target.checked
                                      ? [...topic.materialIds, item.id]
                                      : topic.materialIds.filter((id) => id !== item.id),
                                  })
                                }
                              />
                              <span>
                                {item.data.title}
                                <small>
                                  {item.data.shared &&
                                  (!item.data.studentIds?.length ||
                                    item.data.studentIds.includes(student.id))
                                    ? 'Открыт этому ученику'
                                    : 'Этому ученику пока не открыт'}
                                </small>
                              </span>
                            </label>
                          ))}
                        <p className="ip-material-hint">
                          Привязка к теме не меняет доступ. Открыть материал ученику можно в разделе
                          «Материалы».
                        </p>
                        {topic.materialIds
                          .filter((id) => !materials.some((item) => item.id === id))
                          .map((id) => (
                            <label key={id}>
                              <input
                                type="checkbox"
                                checked
                                onChange={() =>
                                  changeTopic(block.id, topic.id, {
                                    materialIds: topic.materialIds.filter((value) => value !== id),
                                  })
                                }
                              />
                              <span>Недоступный материал — снимите отметку, чтобы убрать</span>
                            </label>
                          ))}
                        {!materials.length && (
                          <p>
                            Добавьте файлы в разделе «Материалы», затем их можно будет связать с
                            темой.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    block.topics.length >= 100 ||
                    program.blocks.reduce((count, item) => count + item.topics.length, 0) >= 500
                  }
                  onClick={() =>
                    changeBlock(block.id, {
                      topics: [
                        ...block.topics,
                        { id: crypto.randomUUID(), title: '', status: 'auto', materialIds: [] },
                      ],
                    })
                  }
                >
                  <Plus size={16} />
                  Добавить тему
                </Button>
              </section>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={program.blocks.length >= 30}
            onClick={() =>
              setProgram({
                ...program,
                blocks: [...program.blocks, { id: crypto.randomUUID(), title: '', topics: [] }],
              })
            }
          >
            <Plus size={18} />
            Добавить раздел
          </Button>
          <FormError error={error} />
          <div className="ip-editor-footer">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить программу'}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
