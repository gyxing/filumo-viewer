import type { TextDecoration } from './types';

interface Range {
  start: number;
  end: number;
}
export interface TextHit extends Range {
  current: boolean;
}
export interface TextSegment extends Range {
  className?: string;
  emphasis?: 'current' | 'match' | 'reveal';
}

/** 合并可见行的语法、查找和定位范围，所有分段仍精确覆盖原文。 */
export function textSegments(
  start: number,
  end: number,
  decorations: readonly TextDecoration[],
  hits: readonly TextHit[],
  reveal?: Range,
): TextSegment[] {
  const clip = <T extends Range>(range: T): T | undefined =>
    Number.isFinite(range.start) &&
    Number.isFinite(range.end) &&
    range.end > range.start &&
    range.end > start &&
    range.start < end
      ? {
          ...range,
          start: Math.max(start, range.start),
          end: Math.min(end, range.end),
        }
      : undefined;
  const syntax: TextDecoration[] = [];
  for (const item of decorations) {
    const range = clip(item);
    if (
      !range ||
      !/^[a-zA-Z_][\w-]*(?: [a-zA-Z_][\w-]*)*$/.test(range.className) ||
      (syntax.at(-1)?.end ?? start) > range.start
    )
      continue;
    syntax.push(range);
  }
  const matches = hits.map(clip).filter((item): item is TextHit => !!item);
  const located = reveal && clip(reveal);
  const points = new Set([start, end]);
  for (const range of [...syntax, ...matches, ...(located ? [located] : [])]) {
    points.add(range.start);
    points.add(range.end);
  }
  const sorted = [...points].sort((a, b) => a - b),
    segments: TextSegment[] = [];
  let decoration = 0,
    match = 0;
  for (let index = 0; index + 1 < sorted.length; index++) {
    const from = sorted[index],
      to = sorted[index + 1];
    if (to <= from) continue;
    while (decoration < syntax.length && syntax[decoration].end <= from)
      decoration++;
    while (match < matches.length && matches[match].end <= from) match++;
    const color = syntax[decoration],
      hit = matches[match];
    segments.push({
      start: from,
      end: to,
      className: color && color.start <= from ? color.className : undefined,
      emphasis:
        hit && hit.start <= from
          ? hit.current
            ? 'current'
            : 'match'
          : located && located.start <= from && located.end > from
          ? 'reveal'
          : undefined,
    });
  }
  return segments;
}
