export interface RichLink {
  href: string;
  label: string;
  accent: string;
}

export type RichSegment = { text: string } | { link: RichLink };

/**
 * A translated sentence with `{name}` placeholders, as text and link segments,
 * so each language keeps its own word order around the links.
 */
export function richText(text: string, links: Record<string, RichLink>): RichSegment[] {
  const segments: RichSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{(\w+)\}/g)) {
    const link = links[match[1]];
    if (!link) throw new Error(`richText: no link for placeholder "{${match[1]}}" in "${text}"`);
    if (match.index! > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({ link });
    last = match.index! + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
