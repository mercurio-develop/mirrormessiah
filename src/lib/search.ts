const SEARCH_STOP_WORDS = new Set(['the', 'a', 'an']);

/** Strip redundant articles from search queries before matching. */
export function normalizeSearchQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 0 && !SEARCH_STOP_WORDS.has(term.toLowerCase()))
    .join(' ');
}

export function getSearchTerms(q: string): string[] {
  const normalized = normalizeSearchQuery(q);
  return normalized ? normalized.split(/\s+/) : [];
}
