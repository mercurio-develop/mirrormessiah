export interface Library {
  id: number;
  name: string;
  root_path: string;
  created_at: string;
}

export interface Movie {
  id: number;
  title: string;
  year: number | null;
  quality: string | null;
  imdb_id: string | null;
  tmdb_id: number | null;
  thumbnail: string | null;
  created_at: string;
  updated_at: string;
  
  // Enriched Metadata
  plot: string | null;
  rating: number | null;
  genres: string | null;
  audience: 'family' | 'adult' | null;
  director: string | null;
  language: string | null;
  runtime: number | null;
  needs_repair: number;
}

export interface File {
  id: number;
  library_id: number;
  movie_id: number;
  path: string;
  size_bytes: number | null;
  container: string | null;
  added_at: string;
}

export interface MovieWithFile extends Movie {
  file_path?: string;
  file_size?: number | null;
  file_container?: string | null;
  has_subtitles?: number;
}
