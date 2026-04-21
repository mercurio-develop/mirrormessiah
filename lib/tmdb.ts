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
  const params: Record<string, string> = { query: title };
  if (year) params.year = String(year);

  const data = await tmdbFetch<{ results: TmdbSearchResult[] }>('/search/movie', params);
  return data.results[0] ?? null;
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`, {
    append_to_response: 'credits',
  });
}

export function posterUrl(posterPath: string): string {
  return `${IMAGE_BASE}${posterPath}`;
}

export function extractDirector(details: TmdbMovieDetails): string | null {
  return details.credits?.crew.find(c => c.job === 'Director')?.name ?? null;
}