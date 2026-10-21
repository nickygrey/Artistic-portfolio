/** The 1-based frame a `?frame=` search names, or null for anything that is not a frame in range. */
export function parseFrame(search: string, count: number): number | null {
  const raw = new URLSearchParams(search).get('frame');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= count ? n : null;
}

/** `href` as path + search + hash, with `frame` set to `n` or removed when `n` is null. */
export function withFrame(href: string, n: number | null): string {
  const url = new URL(href);
  if (n === null) url.searchParams.delete('frame');
  else url.searchParams.set('frame', String(n));
  return url.pathname + url.search + url.hash;
}
