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
  const containerId = hit.containerId || hit.customData?.richText?.containerId;
  const parent = containerId ? elements.find((e) => e.id === containerId) || hit : hit;
  const group = parent.groupIds?.at(-1);
  const ids = new Set<string>([parent.id]);
  if (group)
    for (const e of elements) if (!e.isDeleted && e.groupIds?.includes(group)) ids.add(e.id);
  for (const e of elements)
    if (!e.isDeleted && e.containerId && ids.has(e.containerId)) ids.add(e.id);
  for (const e of elements)
    if (
      !e.isDeleted &&
      e.customData?.richText?.containerId &&
      ids.has(e.customData.richText.containerId)
    )
      ids.add(e.id);
  for (const e of elements)
    if (!e.isDeleted && ids.has(e.customData?.stickerAnnotation?.stickerId)) ids.add(e.id);
  return [...ids];
}

export function duplicateObjects(
  elements: readonly any[],
  selected: ReadonlySet<string>,
  uuid: () => string = () => crypto.randomUUID(),
) {
  const ids = new Set(selected);
  for (const e of elements)
    if (ids.has(e.id)) for (const id of objectSelection(elements, e.id)) ids.add(id);
  for (const e of elements)
    if (
      !e.isDeleted &&
      (ids.has(e.customData?.stickerAnnotation?.stickerId) ||
        ids.has(e.customData?.slideAnnotation?.presentationId))
    )
      ids.add(e.id);
  const originals = elements.filter((e) => !e.isDeleted && ids.has(e.id)),
    mapping = new Map(originals.map((e) => [e.id, uuid()])),
    groups = new Map<string, string>();
  for (const e of originals)
    for (const g of e.groupIds || []) if (!groups.has(g)) groups.set(g, uuid());
  return originals.map((e) => {
    const data = structuredClone(e.customData || {});
    if (data.stickerAnnotation)
      data.stickerAnnotation.stickerId =
        mapping.get(data.stickerAnnotation.stickerId) || data.stickerAnnotation.stickerId;
    if (data.slideAnnotation)
      data.slideAnnotation.presentationId =
        mapping.get(data.slideAnnotation.presentationId) || data.slideAnnotation.presentationId;
    if (data.richText?.containerId)
      data.richText.containerId =
        mapping.get(data.richText.containerId) || data.richText.containerId;
    if (data.boardFigure) data.boardFigure.id = groups.get(data.boardFigure.id) || uuid();
    if (data.boardLine) data.boardLine.groupId = groups.get(data.boardLine.groupId) || uuid();
    return {
      ...structuredClone(e),
      id: mapping.get(e.id),
      x: e.x + 24,
      y: e.y + 24,
      index: undefined,
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      locked: false,
      groupIds: (e.groupIds || []).map((g: string) => groups.get(g)),
      customData: data,
      ...(e.containerId ? { containerId: mapping.get(e.containerId) || e.containerId } : {}),
      ...(e.boundElements
        ? {
            boundElements: e.boundElements
              .filter((b: any) => mapping.has(b.id))
              .map((b: any) => ({ ...b, id: mapping.get(b.id) })),
          }
        : {}),
      ...Object.fromEntries(
        ['startBinding', 'endBinding']
          .filter((k) => e[k])
          .map((k) => [
            k,
            mapping.has(e[k].elementId)
              ? { ...e[k], elementId: mapping.get(e[k].elementId) }
              : null,
          ]),
      ),
      ...(e.frameId ? { frameId: mapping.get(e.frameId) || null } : {}),
    };
  });
}

/** Body hits are for moving. Native handles outside the geometry remain available for resizing. */
export function movableHit(elements: readonly any[], point: Point, tolerance: number) {
  const hit = canvasHit(elements, point, tolerance);
  if (hit) return hit;
  for (let i = elements.length - 1; i >= 0; i--) {
    const e = elements[i];
    if (e.isDeleted || e.locked) continue;
    const closed =
      ['rectangle', 'ellipse', 'diamond'].includes(e.type) ||
      (e.type === 'line' &&
        e.points?.length > 2 &&
        e.points[0][0] === e.points.at(-1)[0] &&
        e.points[0][1] === e.points.at(-1)[1]);
    if (closed && hitCanvasElement({ ...e, backgroundColor: '#fff' }, point, 0)) return e;
  }
  return undefined;
}
export function movingObjectIds(elements: readonly any[], selection: readonly string[]) {
  const ids = new Set(selection);
  let added = true;
  while (added) {
    added = false;
    for (const e of elements) {
      if (e.isDeleted || ids.has(e.id)) continue;
      const owner =
        e.customData?.stickerAnnotation?.stickerId ||
        e.customData?.slideAnnotation?.presentationId ||
        e.customData?.richText?.containerId ||
        e.containerId;
      if (owner && ids.has(owner)) {
        ids.add(e.id);
        added = true;
      }
    }
  }
  return ids;
}
export function translateObjects(
  elements: readonly any[],
  ids: ReadonlySet<string>,
  dx: number,
  dy: number,
) {
  return elements.map((e) =>
    !e.isDeleted && ids.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e,
  );
}
