import { b64urlEncode } from '@/lib/b64url';

export function getCoursePosterUrl(thumbnail: string | null | undefined): string {
  if (!thumbnail) return '/placeholder.svg';
  if (thumbnail.startsWith('http')) return thumbnail;
  const [basePath, query] = thumbnail.split('?');
  let url = '/api/images?path=' + b64urlEncode(basePath);
  if (query) url += '&' + query;
  return url;
}

export function getCourseImageUrl(thumbnail: string | null | undefined): string | null {
  if (!thumbnail) return null;
  return getCoursePosterUrl(thumbnail);
}

/** Mirrors Python course_parse.module_folder_name for UI folder hints. */
export function moduleFolderLabel(
  kind: string,
  number: number,
  title: string | null | undefined,
): string {
  const prefix =
    kind === 'week' ? 'Week' : kind === 'chapter' ? 'Chapter' : kind === 'section' ? 'Section' : 'Module';
  const base = `${prefix} ${number.toString().padStart(2, '0')}`;
  if (!title) return base;
  const lowerTitle = title.toLowerCase();
  if (lowerTitle === `${kind} ${number}` || lowerTitle === `${prefix.toLowerCase()} ${number}`) {
    return base;
  }
  if (lowerTitle.startsWith(base.toLowerCase())) return title;
  return `${base} — ${title}`;
}

export function moduleKindBadge(kind: string): string {
  if (kind === 'week') return 'Week';
  if (kind === 'chapter') return 'Chapter';
  if (kind === 'section') return 'Section';
  return 'Module';
}
