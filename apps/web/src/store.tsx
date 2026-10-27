import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { api } from './api';
import {
  kinds,
  type User,
  type Student,
  type Board,
  type Entry,
  type RecordKind,
} from '../../../packages/contracts';

export const emptyRecords = Object.fromEntries(kinds.map((k) => [k, [] as Entry[]])) as Record<
  RecordKind,
  Entry[]
>;
type Store = {
  user: User;
  setUser: (u: User) => void;
  students: Student[];
  boards: Board[];
  records: Record<RecordKind, Entry[]>;
  refresh: () => Promise<void>;
  toast: (message: string) => void;
  studentName: (id: string | null) => string;
  create: (
    kind: RecordKind,
    data: Record<string, unknown>,
    studentId?: string | null,
  ) => Promise<Entry>;
  update: (
    entry: Entry,
    data: Record<string, unknown>,
    studentId?: string | null,
  ) => Promise<Entry>;
  remove: (entry: Entry) => Promise<void>;
};
const Context = createContext<Store>(null!);
export const useApp = () => useContext(Context);
export function AppStore({
  user,
  setUser,
  children,
}: {
  user: User;
  setUser: (u: User) => void;
  children: ReactNode;
}) {
  const [students, setStudents] = useState<Student[]>([]),
    [boards, setBoards] = useState<Board[]>([]),
    [records, setRecords] = useState(emptyRecords),
    [message, setMessage] = useState('');
  const toast = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 5000);
  }, []);
  const refresh = useCallback(async () => {
    const [students, boards, ...lists] = await Promise.all([
      api<Student[]>('/students'),
      api<Board[]>('/boards'),
      ...kinds.map((k) => api<Entry[]>(`/records/${k}`)),
    ]);
    setStudents(students as Student[]);
    setBoards(boards as Board[]);
    setRecords(
      Object.fromEntries(kinds.map((k, i) => [k, lists[i]])) as Record<RecordKind, Entry[]>,
    );
  }, [user.id]);
  const create = async (
    kind: RecordKind,
    data: Record<string, unknown>,
    studentId?: string | null,
  ) => {
    const item = await api<Entry>(`/records/${kind}`, { data, studentId });
    await refresh();
    toast('Сохранено');
    return item;
  };
  const update = async (entry: Entry, data: Record<string, unknown>, studentId?: string | null) => {
    const item = await api<Entry>(
      `/records/${entry.kind}/${entry.id}`,
      { data, studentId },
      'PATCH',
    );
    await refresh();
    toast('Изменения сохранены');
    return item;
  };
  const remove = async (entry: Entry) => {
    await api(`/records/${entry.kind}/${entry.id}`, undefined, 'DELETE');
    await refresh();
    toast('Запись удалена');
  };
  return (
    <Context.Provider
      value={{
        user,
        setUser,
        students,
        boards,
        records,
        refresh,
        toast,
        studentName: (id) => students.find((s) => s.id === id)?.name || 'Без ученика',
        create,
        update,
        remove,
      }}
    >
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
        </div>
      )}
    </Context.Provider>
  );
}
