import { cp, mkdir } from 'node:fs/promises';
const target = new URL('../apps/web/public/excalidraw-assets/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(
  new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts/', import.meta.url),
  new URL('fonts/', target),
  { recursive: true },
);
for (const folder of ['standard_fonts', 'cmaps', 'wasm']) {
  const destination = new URL(`../apps/web/public/pdf-assets/${folder}/`, import.meta.url);
  await mkdir(destination, { recursive: true });
  await cp(new URL(`../node_modules/pdfjs-dist/${folder}/`, import.meta.url), destination, {
    recursive: true,
  });
}
