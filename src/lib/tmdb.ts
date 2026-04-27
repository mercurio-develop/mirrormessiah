const BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const API_KEY = process.env.TMDB_API_KEY;

export interface TmdbMovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  overview: string | null;
  release_date: string | null;
  vote_average: number | null;
  genres: Array<{ id: number; name: string }>;
  runtime: number | null;
  original_language: string | null;
  poster_path: string | null;
  credits?: {
    crew: Array<{ job: string; name: string }>;
  };
}

export interface TmdbSearchResult {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
}

export interface TmdbSeriesDetails {
  id: number;
  name: string;
  overview: string | null;
  first_air_date: string | null;
  vote_average: number | null;
  genres: Array<{ id: number; name: string }>;
  original_language: string | null;
  poster_path: string | null;
  credits?: {
    crew: Array<{ job: string; name: string }>;
  };
}

export interface TmdbSeriesSearchResult {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  if (!API_KEY) throw new Error('TMDB_API_KEY not set');

  const url = new URL(`${BASE}${endpoint}`);
  url.searchParams.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${endpoint} → ${res.status}`);
  return res.json();
}

export async function searchMovie(title: string, year?: number | null): Promise<TmdbSearchResult | null> {
  const clean = (t: string) => {
    // Technical noise usually found in scene releases
    const noise = [
      'PROPER', 'REPACK', 'UNRATED', 'EXTENDED', 'DIRECTORS CUT', 'LIMITED', 'INTERNAL', 
      'RERIP', 'REAL', 'READNFO', 'SUBBED', 'DUBBED', 'HC', 'HDRIP', 'BDRIP', 'BRRIP'
    ];
    let cleaned = t;
    noise.forEach(n => {
      const re = new RegExp(`\\b${n}\\b`, 'gi');
      cleaned = cleaned.replace(re, '');
    });
    return cleaned.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  };
  
  const searchAttempts = [
    { query: title, year: year ? String(year) : undefined },
    { query: title },
    { query: clean(title), year: year ? String(year) : undefined },
    { query: clean(title) },
  ];

  // If title has a comma or colon, it might be a subtitle. Add short title attempt.
  if (title.includes(',') || title.includes(':')) {
    const shortTitle = title.split(/[,:]/)[0].trim();
    if (shortTitle.length > 3) {
      searchAttempts.push({ query: shortTitle, year: year ? String(year) : undefined });
      searchAttempts.push({ query: shortTitle });
    }
  }

  for (const attempt of searchAttempts) {
    try {
      const params: Record<string, string> = { query: attempt.query };
      if (attempt.year) params.year = attempt.year;
      
      const data = await tmdbFetch<{ results: TmdbSearchResult[] }>('/search/movie', params);
      if (data.results && data.results.length > 0) {
        return data.results[0];
      }
    } catch (e) {
      console.error(`TMDB Search failed for ${attempt.query}:`, e);
    }
  }

  return null;
}

export async function searchSeries(title: string, year?: number | null): Promise<TmdbSeriesSearchResult | null> {
  const clean = (t: string) => {
    const noise = [
      'PROPER', 'REPACK', 'UNRATED', 'EXTENDED', 'LIMITED', 'INTERNAL', 
      'RERIP', 'REAL', 'SUBBED', 'DUBBED', 'HC', 'S\\d{2}', 'SEASON\\s*\\d+'
    ];
    let cleaned = t;
    noise.forEach(n => {
      const re = new RegExp(`\\b${n}\\b`, 'gi');
      cleaned = cleaned.replace(re, '');
    });
    return cleaned.replace(/[^\w\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  };
  
  const searchAttempts = [
    { query: title, first_air_date_year: year ? String(year) : undefined },
    { query: title },
    { query: clean(title), first_air_date_year: year ? String(year) : undefined },
    { query: clean(title) },
  ];

  if (title.includes(',') || title.includes(':')) {
    const shortTitle = title.split(/[,:]/)[0].trim();
    if (shortTitle.length > 3) {
      searchAttempts.push({ query: shortTitle, first_air_date_year: year ? String(year) : undefined });
      searchAttempts.push({ query: shortTitle });
    }
  }

  for (const attempt of searchAttempts) {
    try {
      const params: Record<string, string> = { query: attempt.query };
      if (attempt.first_air_date_year) params.first_air_date_year = attempt.first_air_date_year;
      
      const data = await tmdbFetch<{ results: TmdbSeriesSearchResult[] }>('/search/tv', params);
      if (data.results && data.results.length > 0) {
        return data.results[0];
      }
    } catch (e) {
      console.error(`TMDB Series Search failed for ${attempt.query}:`, e);
    }
  }

  return null;
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, {
    append_to_response: 'credits',
  });
}

export async function getSeriesDetails(tmdbId: number): Promise<TmdbSeriesDetails> {
  return tmdbFetch<TmdbSeriesDetails>(`/tv/${tmdbId}`, {
    append_to_response: 'credits',
  });
}

export function posterUrl(posterPath: string): string {
  return `${IMAGE_BASE}${posterPath}`;
}

export function extractDirector(details: TmdbMovieDetails | TmdbSeriesDetails): string | null {
  return details.credits?.crew.find(c => c.job === 'Director' || c.job === 'Executive Producer')?.name ?? null;
}