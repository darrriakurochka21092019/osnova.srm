import type { BoardBackground } from '../../../../packages/contracts';
export const backgrounds: { id: BoardBackground; title: string }[] = [
  { id: 'white', title: 'Белый холст' },
  { id: 'grid', title: 'Клетка' },
  { id: 'ruled', title: 'Линии' },
  { id: 'dots', title: 'Точки' },
];
export const backgroundStep = (type: BoardBackground) => (type === 'ruled' ? 32 : 24);
export function backgroundStyle(type: BoardBackground, zoom = 1, x = 0, y = 0) {
  const step = backgroundStep(type) * zoom;
  return {
    backgroundColor: '#fff',
    backgroundImage:
      type === 'grid'
        ? 'linear-gradient(#dfe5ef 1px,transparent 1px),linear-gradient(90deg,#dfe5ef 1px,transparent 1px)'
        : type === 'ruled'
          ? 'linear-gradient(#dfe5ef 1px,transparent 1px)'
          : type === 'dots'
            ? 'radial-gradient(circle,#b8c2d5 1px,transparent 1.2px)'
            : 'none',
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${x * zoom}px ${y * zoom}px`,
  };
}
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  type: BoardBackground,
  offsetX = 0,
  offsetY = 0,
  scale = 1,
) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  if (type === 'white') return;
  const step = backgroundStep(type) * scale,
    x = ((offsetX % step) + step) % step,
    y = ((offsetY % step) + step) % step;
  if (type === 'dots') {
    ctx.fillStyle = '#b8c2d5';
    for (let i = x; i < width; i += step)
      for (let j = y; j < height; j += step) {
        ctx.beginPath();
        ctx.arc(i, j, Math.max(0.7, scale), 0, Math.PI * 2);
        ctx.fill();
      }
    return;
  }
  ctx.strokeStyle = '#dfe5ef';
  ctx.lineWidth = Math.max(0.75, scale);
  ctx.beginPath();
  for (let j = y; j < height; j += step) {
    ctx.moveTo(0, j);
    ctx.lineTo(width, j);
  }
  if (type === 'grid')
    for (let i = x; i < width; i += step) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i, height);
    }
  ctx.stroke();
}
