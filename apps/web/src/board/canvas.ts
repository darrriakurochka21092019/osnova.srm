import {
  annotationOf,
  changedElement,
  presentationOf,
  slideIsHidden,
} from '../../../../packages/contracts/canvas';

/** Restore hidden annotations and attach newly created objects to the visible PDF slide. */
export function captureCanvas(
  rendered: readonly any[],
  previous: readonly any[],
  options: { attachNew?: boolean; attachIds?: ReadonlySet<string>; transform?: boolean } = {},
) {
  const old = new Map(previous.map((e) => [e.id, e]));
  const decks = rendered.filter((e) => !e.isDeleted && presentationOf(e));
  const decksById = new Map(decks.map((e) => [e.id, e]));
  const stickers = rendered.filter((e) => !e.isDeleted && e.customData?.sticker).reverse();
  const frontToBack = [...decks].reverse();
  const elements = rendered.map((e) => {
    const before = old.get(e.id);
    if (presentationOf(e) && e.angle && options.transform !== false)
      return changedElement(e, { angle: 0 });
    if (before && slideIsHidden(before, previous, old)) {
      // The renderer can normalize old/imported indices or geometry. Keep that version
      // while undoing only the virtual deletion; otherwise normalization loops forever.
      return e.version > before.version ? { ...e, isDeleted: before.isDeleted } : before;
    }
    if (
      (before && !options.attachIds?.has(e.id)) ||
      e.isDeleted ||
      presentationOf(e) ||
      annotationOf(e) ||
      e.customData?.stickerAnnotation ||
      options.attachNew === false
    )
      return e;
    const sticker = stickers.find(
      (s) =>
        s.id !== e.id &&
        e.containerId !== s.id &&
        e.x + e.width / 2 >= s.x &&
        e.x + e.width / 2 <= s.x + s.width &&
        e.y + e.height / 2 >= s.y &&
        e.y + e.height / 2 <= s.y + s.height,
    );
    if (sticker)
      return changedElement(e, {
        customData: { ...e.customData, stickerAnnotation: { stickerId: sticker.id } },
      });
    const deck = frontToBack.find(
      (d) =>
        e.x + e.width / 2 >= d.x &&
        e.x + e.width / 2 <= d.x + d.width &&
        e.y + e.height / 2 >= d.y &&
        e.y + e.height / 2 <= d.y + d.height,
    );
    return deck
      ? changedElement(e, {
          customData: {
            ...e.customData,
            slideAnnotation: {
              presentationId: deck.id,
              slideIndex: presentationOf(deck)!.slideIndex,
            },
          },
        })
      : e;
  });
  if (options.transform === false) return elements;
  const withPDF = elements.map((e) => {
    const annotation = annotationOf(e),
      deck = annotation && decksById.get(annotation.presentationId),
      prior = deck && old.get(deck.id);
    return deck && prior && old.has(e.id) ? transformChild(e, old.get(e.id), deck, prior) : e;
  });
  const byId = new Map(withPDF.map((e) => [e.id, e]));
  return withPDF.map((e) => {
    const id = e.customData?.stickerAnnotation?.stickerId,
      parent = id && byId.get(id),
      prior = parent && old.get(id);
    return parent && prior && old.has(e.id) ? transformChild(e, old.get(e.id), parent, prior) : e;
  });
}

function transformChild(e: any, source: any, parent: any, prior: any) {
  const sx = parent.width / prior.width,
    sy = parent.height / prior.height;
  const angle = (parent.angle || 0) - (prior.angle || 0);
  if (parent.x === prior.x && parent.y === prior.y && sx === 1 && sy === 1 && !angle) return e;
  const dx = source.x + source.width / 2 - prior.x - prior.width / 2,
    dy = source.y + source.height / 2 - prior.y - prior.height / 2;
  const a = -(prior.angle || 0),
    b = parent.angle || 0;
  const localX = (dx * Math.cos(a) - dy * Math.sin(a)) * sx,
    localY = (dx * Math.sin(a) + dy * Math.cos(a)) * sy;
  const width = source.width * sx,
    height = source.height * sy,
    x = parent.x + parent.width / 2 + localX * Math.cos(b) - localY * Math.sin(b) - width / 2,
    y = parent.y + parent.height / 2 + localX * Math.sin(b) + localY * Math.cos(b) - height / 2;
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (
    close(e.x, x) &&
    close(e.y, y) &&
    close(e.width, width) &&
    close(e.height, height) &&
    close(e.angle || 0, (source.angle || 0) + angle)
  )
    return e;
  return changedElement(e, {
    x,
    y,
    width,
    height,
    angle: (source.angle || 0) + angle,
    ...(source.points
      ? { points: source.points.map(([px, py]: number[]) => [px * sx, py * sy]) }
      : {}),
    ...(source.type === 'text' ? { fontSize: source.fontSize * Math.min(sx, sy) } : {}),
  });
}

/** Keep committed state separate from Excalidraw's mutable live elements. Clone only changed objects. */
export function snapshotCanvas(elements: readonly any[], previous: readonly any[]) {
  const old = new Map(previous.map((e) => [e.id, e]));
  return elements.map((e) => {
    const before = old.get(e.id);
    return before &&
      before.version === e.version &&
      before.versionNonce === e.versionNonce &&
      before.isDeleted === e.isDeleted
      ? before
      : structuredClone(e);
  });
}
