type Point = { x: number; y: number };

const segmentDistance = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

// Only used on selection clicks, never on pen samples. Test the visible geometry,
// including rotation, so a large transparent locked shape does not cover its contents.
export function hitCanvasElement(e: any, point: Point, tolerance: number): boolean {
  if (e.isDeleted) return false;
  const cx = e.x + e.width / 2,
    cy = e.y + e.height / 2;
  const cos = Math.cos(e.angle || 0),
    sin = Math.sin(e.angle || 0);
  const p = {
    x: cx + (point.x - cx) * cos + (point.y - cy) * sin - e.x,
    y: cy - (point.x - cx) * sin + (point.y - cy) * cos - e.y,
  };
  const t = tolerance + (e.strokeWidth || 1) / 2;
  if (p.x < -t || p.y < -t || p.x > e.width + t || p.y > e.height + t) return false;
  const filled = e.backgroundColor && e.backgroundColor !== 'transparent';
  if (e.type === 'text' || e.type === 'image' || e.type === 'frame') return true;
  if (e.type === 'ellipse') {
    const rx = Math.max(e.width / 2, 0.01),
      ry = Math.max(e.height / 2, 0.01);
    const radius = Math.hypot((p.x - rx) / rx, (p.y - ry) / ry);
    return filled
      ? radius <= 1 + t / Math.min(rx, ry)
      : Math.abs(radius - 1) <= t / Math.min(rx, ry);
  }
  const points: number[][] =
    e.points ||
    (e.type === 'diamond'
      ? [
          [e.width / 2, 0],
          [e.width, e.height / 2],
          [e.width / 2, e.height],
          [0, e.height / 2],
          [e.width / 2, 0],
        ]
      : [
          [0, 0],
          [e.width, 0],
          [e.width, e.height],
          [0, e.height],
          [0, 0],
        ]);
  for (let i = 1; i < points.length; i++)
    if (
      segmentDistance(
        p,
        { x: points[i - 1][0], y: points[i - 1][1] },
        { x: points[i][0], y: points[i][1] },
      ) <= t
    )
      return true;
  if (!filled || e.type === 'freedraw') return false;
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i],
      [xj, yj] = points[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function canvasHit(elements: readonly any[], point: Point, tolerance: number) {
  for (let i = elements.length - 1; i >= 0; i--)
    if (hitCanvasElement(elements[i], point, tolerance)) return elements[i];
  return undefined;
}

export function objectSelection(elements: readonly any[], id: string): string[] {
  const hit = elements.find((e) => e.id === id && !e.isDeleted);
  if (!hit) return [];
  const parent = hit.containerId ? elements.find((e) => e.id === hit.containerId) || hit : hit;
  const group = parent.groupIds?.at(-1);
  const ids = new Set<string>([parent.id]);
  if (group)
    for (const e of elements) if (!e.isDeleted && e.groupIds?.includes(group)) ids.add(e.id);
  for (const e of elements)
    if (!e.isDeleted && e.containerId && ids.has(e.containerId)) ids.add(e.id);
  return [...ids];
}
