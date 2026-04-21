import { getDb } from './db';

// Cache for schema detection to avoid repeated queries
let thumbnailColumnExists: boolean | null = null;

/**
 * Detects if the "thumbnail" column exists in the movies table
 * Uses PRAGMA table_info(movies) to check column information
 */
export function hasThumbnailColumn(): boolean {
  // Return cached result if available
  if (thumbnailColumnExists !== null) {
    return thumbnailColumnExists;
  }

  try {
    const db = getDb();
    
    // Get table info for movies table
    const tableInfo = db.prepare('PRAGMA table_info(movies)').all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;
    
    // Check if thumbnail column exists
    thumbnailColumnExists = tableInfo.some(column => column.name === 'thumbnail');
    
    return thumbnailColumnExists;
  } catch (error) {
    console.error('Error checking thumbnail column:', error);
    // Default to false if there's an error
    thumbnailColumnExists = false;
    return false;
  }
}

/**
 * Reset the schema cache (useful for testing or if schema changes)
 */
export function resetSchemaCache(): void {
  thumbnailColumnExists = null;
}

/**
 * Get the appropriate SELECT query for movies based on schema
 */
export function getMoviesSelectQuery(includeFiles = false): string {
  const hasThumbnail = hasThumbnailColumn();
  
  const baseColumns = [
    'm.id',
    'm.title',
    'm.year',
    'm.quality',
    'm.imdb_id',
    'm.tmdb_id',
    'm.created_at',
    'm.updated_at'
  ];
  
  if (hasThumbnail) {
    baseColumns.push('m.thumbnail');
  }
  
  if (includeFiles) {
    baseColumns.push(
      'f.path as file_path',
      'f.size_bytes as file_size',
      'f.container as file_container'
    );
    
    return `
      SELECT ${baseColumns.join(', ')}
      FROM movies m
      LEFT JOIN files f ON m.id = f.movie_id
    `;
  }
  
  return `SELECT ${baseColumns.join(', ')} FROM movies m`;
}

/**
 * Get the appropriate UPDATE query for movies based on schema
 */
export function getMovieUpdateQuery(fields: string[]): string {
  const hasThumbnail = hasThumbnailColumn();
  
  // Filter out thumbnail field if column doesn't exist
  const allowedFields = hasThumbnail 
    ? fields 
    : fields.filter(field => field !== 'thumbnail');
  
  const setClause = allowedFields.map(field => `${field} = ?`).join(', ');
  
  return `UPDATE movies SET ${setClause} WHERE id = ?`;
}

/**
 * Get fallback thumbnail path for movies without thumbnails
 */
export function getFallbackThumbnail(movie: { imdb_id?: string | null }): string {
  // If IMDB ID exists, could potentially construct a poster URL
  // For now, return a placeholder
  if (movie.imdb_id) {
    // Could integrate with IMDB or TMDB API in the future
    return '/placeholder.svg';
  }
  
  return '/placeholder.svg';
}