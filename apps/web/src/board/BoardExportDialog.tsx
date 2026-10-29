import { useEffect, useState, type MutableRefObject } from 'react';
import { FileText, Image, Download, LoaderCircle } from 'lucide-react';
import type { EditorHandle } from '../pages/BoardRoom';
import { Modal } from '../ui';
import { defaultExport, type BoardExportOptions, type ExportComment } from './exportLayout';
export default function BoardExportDialog({
  editor,
  comments = [],
  onClose,
}: {
  editor: MutableRefObject<EditorHandle | null>;
  comments?: ExportComment[];
  onClose: () => void;
}) {
  const [format, setFormat] = useState<'pdf' | 'png'>('pdf'),
    [options, setOptions] = useState(defaultExport),
    [withComments, setWithComments] = useState(true),
    [preview, setPreview] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const config: BoardExportOptions = { ...options, comments: withComments ? comments : [] };
  useEffect(() => {
    let cancelled = false;
    setError('');
    void editor.current
      ?.previewExport(config)
      .then((url) => {
        if (!cancelled) setPreview(url);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [options.scope, options.annotations, withComments]);
  const download = async (type: 'png' | 'pdf' | 'scene') => {
    setBusy(true);
    setError('');
    try {
      await editor.current?.export(type, config);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Скачать доску" onClose={onClose} className="board-export-modal">
      <p className="board-export-intro">
        Выберите формат, область холста и параметры для экспорта.
      </p>
      <h3>Формат файла</h3>
      <div className="board-export-formats">
        {[
          ['pdf', 'PDF', 'Подходит для печати и отправки', FileText],
          ['png', 'PNG', 'Изображение высокого качества', Image],
        ].map(([type, name, hint, Icon]: any) => (
          <button
            key={type}
            role="radio"
            aria-checked={format === type}
            aria-label={name}
            className={format === type ? 'active' : ''}
            onClick={() => setFormat(type)}
          >
            <Icon />
            <strong>{name}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <h3>Область</h3>
      <div className="board-export-scope">
        {[
          ['all', 'Весь холст'],
          ['visible', 'Видимая область'],
          ['selection', 'Выделенные объекты'],
        ].map(([value, label]) => (
          <button
            key={value}
            role="radio"
            aria-checked={options.scope === value}
            className={options.scope === value ? 'active' : ''}
            onClick={() => setOptions({ ...options, scope: value as any })}
          >
            {label}
          </button>
        ))}
      </div>
      {format === 'pdf' && (
        <div className="board-export-paper">
          <label>
            Формат листа
            <select
              aria-label="Формат листа"
              value={options.paper}
              onChange={(e) => setOptions({ ...options, paper: e.target.value as any })}
            >
              <option value="a4">A4</option>
              <option value="a3">A3</option>
              <option value="canvas">По размеру холста</option>
            </select>
          </label>
          <label>
            Ориентация
            <select
              aria-label="Ориентация листа"
              value={options.orientation}
              disabled={options.paper === 'canvas'}
              onChange={(e) => setOptions({ ...options, orientation: e.target.value as any })}
            >
              <option value="landscape">Альбомная</option>
              <option value="portrait">Книжная</option>
            </select>
          </label>
        </div>
      )}
      <div className="board-export-preview">
        {preview ? (
          <img src={preview} alt="Предпросмотр доски" />
        ) : (
          <LoaderCircle className="spin" />
        )}
      </div>
      <label className="board-export-check">
        <input
          type="checkbox"
          checked={options.annotations}
          onChange={(e) => setOptions({ ...options, annotations: e.target.checked })}
        />
        Включить пометки и стикеры
      </label>
      {!!comments.length && (
        <label className="board-export-check">
          <input
            type="checkbox"
            checked={withComments}
            onChange={(e) => setWithComments(e.target.checked)}
          />
          Включить комментарии ({comments.length})
        </label>
      )}
      {format === 'pdf' && (
        <p className="board-export-note">
          Выбранная область будет размещена на одном листе. PDF-презентации войдут с текущими
          слайдами.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="board-export-footer">
        <button className="btn btn-secondary" disabled={busy} onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !!error}
          onClick={() => void download(format)}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}Скачать
        </button>
      </div>
    </Modal>
  );
}
