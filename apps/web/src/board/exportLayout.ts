export type ExportComment = { name: string; body: string; date?: string };
export type BoardExportOptions = {
  scope: 'all' | 'visible' | 'selection';
  annotations: boolean;
  comments?: ExportComment[];
  paper: 'canvas' | 'a4' | 'a3';
  orientation: 'portrait' | 'landscape';
  scale: 1 | 2;
};
export const defaultExport: BoardExportOptions = {
  scope: 'all',
  annotations: true,
  paper: 'a4',
  orientation: 'landscape',
  scale: 2,
};
export function pdfLayout(
  width: number,
  height: number,
  paper: BoardExportOptions['paper'],
  orientation: BoardExportOptions['orientation'],
) {
  let pageWidth = width,
    pageHeight = height;
  if (paper !== 'canvas') {
    const size = paper === 'a3' ? [841.89, 1190.55] : [595.28, 841.89];
    [pageWidth, pageHeight] = orientation === 'landscape' ? [size[1], size[0]] : size;
  }
  const margin = paper === 'canvas' ? 0 : 24,
    scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
  return {
    pageWidth,
    pageHeight,
    width: width * scale,
    height: height * scale,
    x: (pageWidth - width * scale) / 2,
    y: (pageHeight - height * scale) / 2,
  };
}
