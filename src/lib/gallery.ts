export const ROLE_KEYS = ['camera', 'lighting', 'edit', 'colour', 'direction', 'interview', 'photography'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

export interface CreditEntry {
  file: string;
  title?: string;
  client?: string;
  roles?: RoleKey[];
  film?: string;
  alt?: string;
  cover?: boolean;
  /** Widest derivative to generate, for photographs whose texture makes large versions too heavy. */
  maxWidth?: number;
}

export interface ImageEntry<I> {
  file: string;
  image: I;
}

export interface Credit {
  title?: string;
  client?: string;
  roles: RoleKey[];
  film?: string;
  alt?: string;
  maxWidth?: number;
}

export interface Frame<I> {
  /** 1-based display position; also the value of `?frame=` in single view. */
  index: number;
  file: string;
  image: I;
  cover: boolean;
  credit?: Credit;
}

export function isGalleryImage(file: string): boolean {
  const dot = file.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.includes(file.slice(dot + 1).toLowerCase());
}

export function buildFrames<I>(slug: string, images: ImageEntry<I>[], credits: CreditEntry[] = []): Frame<I>[] {
  const sorted = images
    .filter((i) => isGalleryImage(i.file))
    .sort((a, b) => a.file.localeCompare(b.file, 'en', { numeric: true, sensitivity: 'base' }));
  const known = new Set(sorted.map((i) => i.file));

  const byFile = new Map<string, CreditEntry>();
  for (const c of credits) {
    if (!known.has(c.file)) {
      throw new Error(
        `Gallery "${slug}": ${slug}.yaml has credits for "${c.file}", but src/content/galleries/${slug}/ has no image with that name.`
      );
    }
    if (byFile.has(c.file)) {
      throw new Error(`Gallery "${slug}": ${slug}.yaml lists "${c.file}" twice.`);
    }
    byFile.set(c.file, c);
  }

  const covers = credits.filter((c) => c.cover);
  if (covers.length > 1) {
    throw new Error(
      `Gallery "${slug}": ${slug}.yaml marks ${covers.length} images as cover (${covers.map((c) => c.file).join(', ')}); mark at most one.`
    );
  }
  const coverFile = covers[0]?.file ?? sorted[0]?.file;

  return sorted.map((img, i) => {
    const entry = byFile.get(img.file);
    const credit = entry && toCredit(entry);
    return {
      index: i + 1,
      file: img.file,
      image: img.image,
      cover: img.file === coverFile,
      ...(credit ? { credit } : {}),
    };
  });
}

function toCredit({ title, client, roles, film, alt, maxWidth }: CreditEntry): Credit | undefined {
  if (!title && !client && !roles?.length && !film && !alt && !maxWidth) return undefined;
  const credit: Credit = { roles: roles ?? [] };
  if (title) credit.title = title;
  if (client) credit.client = client;
  if (film) credit.film = film;
  if (alt) credit.alt = alt;
  if (maxWidth) credit.maxWidth = maxWidth;
  return credit;
}

export function coverOf<I>(frames: Frame<I>[]): Frame<I> | undefined {
  return frames.find((f) => f.cover);
}
