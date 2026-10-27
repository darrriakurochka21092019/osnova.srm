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
  const elements = rendered.map((e) => {
    const before = old.get(e.id);
    if (presentationOf(e) && e.angle && options.transform !== false)
      return changedElement(e, { angle: 0 });
    if (before && slideIsHidden(before, previous)) return before;
    if (
      (before && !options.attachIds?.has(e.id)) ||
      e.isDeleted ||
      presentationOf(e) ||
      annotationOf(e) ||
      options.attachNew === false
    )
      return e;
    const deck = [...decks]
      .reverse()
      .find(
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
  // New strokes and their versioned ownership metadata must reach the renderer together.
  return options.transform === false
    ? elements
    : elements.map((e) => {
        const annotation = annotationOf(e);
        if (!annotation) return e;
        const deck = decks.find((d) => d.id === annotation.presentationId),
          prior = deck && old.get(deck.id);
        if (!deck || !prior || !old.has(e.id)) return e;
        const sx = deck.width / prior.width,
          sy = deck.height / prior.height;
        if (deck.x === prior.x && deck.y === prior.y && sx === 1 && sy === 1) return e;
        const source = old.get(e.id);
        const x = deck.x + (source.x - prior.x) * sx,
          y = deck.y + (source.y - prior.y) * sy;
        if (
          e.x === x &&
          e.y === y &&
          e.width === source.width * sx &&
          e.height === source.height * sy
        )
          return e;
        // Resize text from its font size, and geometric/freehand strokes from their local points.
        return changedElement(e, {
          x,
          y,
          width: source.width * sx,
          height: source.height * sy,
          ...(source.points
            ? { points: source.points.map(([x, y]: number[]) => [x * sx, y * sy]) }
            : {}),
          ...(e.type === 'text' ? { fontSize: source.fontSize * Math.min(sx, sy) } : {}),
        });
      });
}
