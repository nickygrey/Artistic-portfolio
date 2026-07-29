/**
 * Every photograph in src/assets/photos, sorted numerically by filename.
 * `import.meta.glob` with eager:true gives Astro the static references it
 * needs to optimise each file — a runtime template string cannot.
 * Adding a photograph means dropping a file in the directory; nothing else.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/photos/*.{jpg,jpeg,png}',
  { eager: true }
);

export const photos: ImageMetadata[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, mod]) => mod.default);
