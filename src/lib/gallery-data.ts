import { getEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { buildFrames, type Frame, type ImageEntry } from './gallery';
import { DISCIPLINES, type Discipline, type DisciplineSlug } from './disciplines';

const modules = import.meta.glob<{ default: ImageMetadata }>(
  '/src/content/galleries/*/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG,WEBP}',
  { eager: true }
);

function imagesFor(slug: DisciplineSlug): ImageEntry<ImageMetadata>[] {
  return Object.entries(modules)
    .filter(([path]) => path.split('/').at(-2) === slug)
    .map(([path, mod]) => ({ file: path.split('/').at(-1)!, image: mod.default }));
}

export async function getGallery(slug: DisciplineSlug): Promise<Frame<ImageMetadata>[]> {
  const entry = await getEntry('credits', slug);
  return buildFrames(slug, imagesFor(slug), entry?.data.frames);
}

export async function getActiveDisciplines(): Promise<
  Array<{ discipline: Discipline; frames: Frame<ImageMetadata>[] }>
> {
  const all = await Promise.all(
    DISCIPLINES.map(async (discipline) => ({ discipline, frames: await getGallery(discipline.slug) }))
  );
  return all.filter((d) => d.frames.length > 0);
}

export async function galleryPaths(): Promise<Array<{ params: { discipline: DisciplineSlug } }>> {
  return (await getActiveDisciplines()).map(({ discipline }) => ({ params: { discipline: discipline.slug } }));
}
