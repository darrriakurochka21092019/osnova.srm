import type { ElementData, PresentationData, PresentationSlide } from './index';

type SceneElement = ElementData & {
  x: number;
  y: number;
  width: number;
  height: number;
  customData?: Record<string, any>;
};
export function presentationOf(element: any): PresentationData | undefined {
  const p = element.customData?.presentation;
  return element.type === 'image' && p && Array.isArray(p.slides) && p.slides.length
    ? p
    : undefined;
}
export function annotationOf(
  element: any,
): { presentationId: string; slideIndex: number } | undefined {
  return element.customData?.slideAnnotation;
}
export function slideIsHidden(
  element: any,
  scene: readonly any[],
  index?: ReadonlyMap<string, any>,
): boolean {
  const annotation = annotationOf(element);
  if (!annotation) return false;
  const deck = index
    ? index.get(annotation.presentationId)
    : scene.find((e) => e.id === annotation.presentationId);
  const presentation = deck && presentationOf(deck);
  return !!presentation && (deck.isDeleted || presentation.slideIndex !== annotation.slideIndex);
}
// Visibility is a local rendering projection, not a persisted deletion or a new version.
export function projectCanvas(scene: readonly any[]) {
  const index = new Map(scene.map((e) => [e.id, e]));
  return scene.map((e) => (slideIsHidden(e, scene, index) ? { ...e, isDeleted: true } : e));
}
export function changedElement(element: any, patch: Record<string, any>) {
  return {
    ...element,
    ...patch,
    version: element.version + 1,
    versionNonce: Math.floor(Math.random() * 2 ** 30),
    updated: Date.now(),
  };
}

/** Convert pre-canvas boards without removing their source pages or histories. */
export function unifyLegacyScenes(
  pages: { id: string; title: string; scene: ElementData[] }[],
): ElementData[] {
  const output: SceneElement[] = [],
    used = new Set<string>();
  const decks = new Map<
    string,
    { element: SceneElement; pages: { page: any; background: any }[] }
  >();
  let right = -160;
  const unique = (id: string, pageId: string) => {
    let key = id;
    while (used.has(key)) key = `${pageId.slice(0, 8)}-${key}`;
    used.add(key);
    return key;
  };
  const move = (elements: SceneElement[], dx: number, dy: number, pageId: string) => {
    const ids = new Map(elements.map((e) => [e.id, unique(e.id, pageId)]));
    const groups = new Map<string, string>();
    for (const e of elements)
      for (const g of (e.groupIds || []) as string[])
        if (!groups.has(g)) groups.set(g, `${pageId.slice(0, 8)}-${g}`);
    return elements.map((e) => ({
      ...e,
      id: ids.get(e.id)!,
      x: e.x + dx,
      y: e.y + dy,
      groupIds: ((e.groupIds || []) as string[]).map((g) => groups.get(g)),
      ...(e.containerId ? { containerId: ids.get(e.containerId as string) || null } : {}),
      ...(e.frameId ? { frameId: ids.get(e.frameId as string) || null } : {}),
      ...(e.boundElements
        ? {
            boundElements: (e.boundElements as any[]).map((b) => ({
              ...b,
              id: ids.get(b.id) || b.id,
            })),
          }
        : {}),
      ...(e.startBinding
        ? {
            startBinding: {
              ...(e.startBinding as object),
              elementId:
                ids.get((e.startBinding as any).elementId) || (e.startBinding as any).elementId,
            },
          }
        : {}),
      ...(e.endBinding
        ? {
            endBinding: {
              ...(e.endBinding as object),
              elementId:
                ids.get((e.endBinding as any).elementId) || (e.endBinding as any).elementId,
            },
          }
        : {}),
    }));
  };
  for (const page of pages) {
    const background = page.scene.find(
      (e: any) => !e.isDeleted && e.type === 'image' && e.customData?.pdfSourceId,
    ) as SceneElement | undefined;
    if (background) {
      const key = background.customData!.pdfSourceId;
      if (!decks.has(key)) decks.set(key, { element: background, pages: [] });
      decks.get(key)!.pages.push({ page, background });
      continue;
    }
    const elements = page.scene as SceneElement[];
    if (!elements.length) continue;
    const minX = Math.min(...elements.map((e) => e.x)),
      maxX = Math.max(...elements.map((e) => e.x + e.width));
    const dx = output.length ? right + 160 - minX : 0;
    output.push(...move(elements, dx, 0, page.id));
    right = Math.max(right, maxX + dx);
  }
  for (const [sourceId, group] of decks) {
    group.pages.sort((a, b) => a.background.customData.pdfPage - b.background.customData.pdfPage);
    const first = group.pages[0],
      background = first.background;
    const id = unique(background.id, first.page.id),
      x = right + 160,
      y = 40;
    const slides: PresentationSlide[] = group.pages.map(({ background: b }) => ({
      fileId: b.fileId as string,
      width: b.width,
      height: b.height,
    }));
    const presentation: PresentationData = {
      sourceId,
      title: first.page.title.replace(/\s*·\s*\d+$/, ''),
      slides,
      slideIndex: 0,
    };
    const deck = {
      ...background,
      id,
      x,
      y,
      locked: false,
      customData: { ...background.customData, presentation },
      version: background.version + 1,
    };
    output.push(deck);
    right = x + deck.width;
    group.pages.forEach(({ page, background: b }, slideIndex) => {
      const annotations = move(
        page.scene.filter((e: any) => e.id !== b.id),
        x - b.x,
        y - b.y,
        page.id,
      );
      output.push(
        ...annotations.map((e) => ({
          ...e,
          customData: { ...e.customData, slideAnnotation: { presentationId: id, slideIndex } },
        })),
      );
    });
  }
  return output;
}
