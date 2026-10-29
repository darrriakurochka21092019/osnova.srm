export const textFonts = [
  { id: 'onest', name: 'Onest', css: 'Onest' },
  { id: 'unbounded', name: 'Unbounded', css: 'Unbounded' },
  { id: 'literata', name: 'Literata', css: 'Literata' },
  { id: 'caveat', name: 'Caveat', css: 'Caveat' },
  { id: 'pt-mono', name: 'PT Mono', css: 'PT Mono' },
] as const;
export type TextModel = {
  text: string;
  family: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  color: string;
  maxWidth?: number;
  containerId?: string;
};
export const defaultText: TextModel = {
  text: '',
  family: 'onest',
  fontSize: 24,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#11162e',
};
const legacyFamilies: Record<string, string> = {
  '1': 'Virgil',
  '2': 'Arial',
  '3': 'Cascadia',
  '5': 'Excalifont',
  '6': 'Nunito',
  '8': 'Comic Shanns',
};
export const textFamily = (family: string) =>
  textFonts.find((f) => f.id === family)?.css || legacyFamilies[family] || 'Onest';
export const textFont = (m: TextModel, size = m.fontSize) =>
  `${m.italic ? 'italic ' : ''}${m.bold ? '700' : '400'} ${size}px "${textFamily(m.family)}", Arial, sans-serif`;
export function textModel(element: any): TextModel | undefined {
  if (!element) return undefined;
  if (element.customData?.richText) {
    const m = element.customData.richText as TextModel;
    const scale = element.width / (element.customData.richTextSize?.width || element.width || 1);
    return {
      ...m,
      fontSize: Math.round(m.fontSize * scale * 10) / 10,
      ...(m.maxWidth ? { maxWidth: m.maxWidth * scale } : {}),
    };
  }
  if (element.type === 'text')
    return {
      ...defaultText,
      text: element.originalText ?? element.text,
      family: String(element.fontFamily),
      fontSize: element.fontSize,
      color: element.strokeColor,
      align: element.textAlign || 'left',
      ...(element.containerId ? { containerId: element.containerId } : {}),
    };
  return undefined;
}
export function wrapText(text: string, measure: (s: string) => number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const token of paragraph.split(/(\s+)/)) {
      if (line && measure(line + token) > width) {
        lines.push(line.trimEnd());
        line = '';
      }
      for (const char of token) {
        if (line && measure(line + char) > width) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.length ? lines : [''];
}
/** Source text stays in customData. Native image elements provide identical local,
 * shared and exported typography, including synthetic italic/bold where needed.
 */
export async function renderText(model: TextModel) {
  if (model.text.length > 20000) throw new Error('Текстовый блок больше 20 000 символов');
  const m = {
    ...model,
    fontSize: Math.max(8, Math.min(200, model.fontSize)),
    ...(model.maxWidth ? { maxWidth: Math.max(40, Math.min(1800, model.maxWidth)) } : {}),
  };
  await document.fonts.load(textFont(m), model.text || 'АаBb');
  const canvas = document.createElement('canvas'),
    ctx = canvas.getContext('2d')!;
  ctx.font = textFont(m);
  const padding = Math.max(3, m.fontSize * 0.16),
    maxWidth = Math.max(40, Math.min(1800, m.maxWidth || 760)),
    lines = wrapText(m.text, (s) => ctx.measureText(s).width, maxWidth),
    width =
      Math.max(
        20,
        m.maxWidth ? maxWidth : Math.max(...lines.map((s) => ctx.measureText(s).width)),
      ) +
      padding * 2,
    lineHeight = m.fontSize * 1.35,
    height = lines.length * lineHeight + padding * 2,
    scale = Math.min(3, 8000 / Math.max(width, height), Math.sqrt(16_000_000 / (width * height)));
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  ctx.scale(scale, scale);
  ctx.font = textFont(m);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = m.color;
  ctx.strokeStyle = m.color;
  ctx.lineWidth = Math.max(0.7, m.fontSize / 18);
  lines.forEach((line, i) => {
    const advance = ctx.measureText(line).width;
    const x =
      padding +
      (m.align === 'center'
        ? (width - padding * 2 - advance) / 2
        : m.align === 'right'
          ? width - padding * 2 - advance
          : 0);
    const y = padding + m.fontSize * 1.05 + i * lineHeight;
    ctx.fillText(line, x, y);
    if (m.underline && line) {
      ctx.beginPath();
      ctx.moveTo(x, y + m.fontSize * 0.12);
      ctx.lineTo(x + advance, y + m.fontSize * 0.12);
      ctx.stroke();
    }
  });
  return { width, height, dataURL: canvas.toDataURL('image/png'), model: m };
}
