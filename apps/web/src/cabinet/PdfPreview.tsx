import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { fileUrl } from '../api';
import { Button, FormError } from '../ui';

GlobalWorkerOptions.workerSrc = workerUrl;
export default function PdfPreview({ id, name }: { id: string; name: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    setPage(1);
    setPdf(null);
    const loading = getDocument({
      url: fileUrl(id),
      withCredentials: true,
      standardFontDataUrl: '/pdf-assets/standard_fonts/',
      wasmUrl: '/pdf-assets/wasm/',
      cMapUrl: '/pdf-assets/cmaps/',
      cMapPacked: true,
    });
    loading.promise
      .then((doc) => {
        if (active) setPdf(doc);
      })
      .catch((e) => {
        if (active) {
          setError('Не удалось показать PDF. Откройте или скачайте файл ниже.');
          setBusy(false);
        }
      });
    return () => {
      active = false;
      void loading.destroy();
    };
  }, [id]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true,
      rendering: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setBusy(true);
    setError('');
    pdf
      .getPage(page)
      .then(async (sheet) => {
        if (!active || !canvas.current) return;
        const original = sheet.getViewport({ scale: 1 });
        const viewport = sheet.getViewport({
          scale: Math.min(2, 2000 / Math.max(original.width, original.height)),
        });
        const surface = canvas.current;
        surface.width = viewport.width;
        surface.height = viewport.height;
        rendering = sheet.render({
          canvas: surface,
          canvasContext: surface.getContext('2d')!,
          viewport,
        });
        await rendering.promise;
        if (active) setBusy(false);
      })
      .catch((e) => {
        if (active) {
          setError('Не удалось показать страницу PDF.');
          setBusy(false);
        }
      });
    return () => {
      active = false;
      rendering?.cancel();
    };
  }, [pdf, page]);
  return (
    <div className="cabinet-pdf">
      <div className="cabinet-pdf-sheet" aria-busy={busy}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${name}, страница ${page}`}
          style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: pdf ? 'block' : 'none' }}
        />
        {busy && (
          <p className="muted" role="status">
            Загружаем страницу…
          </p>
        )}
      </div>
      <FormError error={error} />
      <div className="cabinet-pdf-controls">
        <Button
          variant="secondary"
          aria-label="Предыдущая страница PDF"
          disabled={page <= 1 || busy}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={17} />
        </Button>
        <span>
          {page} из {pdf?.numPages || '…'}
        </span>
        <Button
          variant="secondary"
          aria-label="Следующая страница PDF"
          disabled={!pdf || page >= pdf.numPages || busy}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={17} />
        </Button>
        <div className="button-row">
          <Button
            variant="secondary"
            aria-label="Уменьшить PDF"
            disabled={zoom <= 0.5}
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
          >
            <Minus size={17} />
          </Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button
            variant="secondary"
            aria-label="Увеличить PDF"
            disabled={zoom >= 2}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            <Plus size={17} />
          </Button>
        </div>
      </div>
    </div>
  );
}
