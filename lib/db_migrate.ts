import { getDb } from './db';

/**
 * Database migration utility for categories and movie_categories tables
 * Ensures idempotent migrations that can be run multiple times safely
 */

export interface Category {
  id: number;
  name: string;
}

/**
 * Run all necessary migrations
 * This function is idempotent and can be called multiple times safely
 */
export function runMigrations(): void {
  const db = getDb();
  
  try {
    // Start a transaction for all migrations
    db.transaction(() => {
      // Create categories table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id    INTEGER PRIMARY KEY,
          name  TEXT NOT NULL UNIQUE
        )
      `);
      
      // Create movie_categories join table if it doesn't exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS movie_categories (
          movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          PRIMARY KEY (movie_id, category_id)
        )
      `);
      
      // Seed default categories if they don't exist
      seedDefaultCategories(db);
      
      // Ensure subtitles table exists (from earlier migrations)
      ensureSubtitlesTable(db);
      
      // Ensure files table has all required columns (from earlier migrations)
      ensureFilesColumns(db);

      // Ensure movies table has all metadata columns
      ensureMoviesColumns(db);

    })();
    
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running database migrations:', error);
    throw error;
  }
}

/**
 * Seed default categories if they don't exist
 */
function seedDefaultCategories(db: any): void {
  const defaultCategories = ['Kids', 'Family', 'Adults'];
  
  const insertCategory = db.prepare(`
    INSERT OR IGNORE INTO categories (name) VALUES (?)
  `);
  
  for (const categoryName of defaultCategories) {
    insertCategory.run(categoryName);
  }
  
  console.log('Default categories seeded');
}

/**
 * Ensure subtitles table exists (idempotent)
 */
function ensureSubtitlesTable(db: any): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS subtitles (
      id          INTEGER PRIMARY KEY,
      movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
      file_id     INTEGER REFERENCES files(id) ON DELETE CASCADE,
      path        TEXT NOT NULL,
      lang        TEXT,
      label       TEXT,
      format      TEXT,           -- 'srt' | 'vtt'
      default_flag INTEGER DEFAULT 0,
      size_bytes  INTEGER,
      UNIQUE(path)
    )
  `);
  
  // Create index for better query performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_subtitles_movie ON subtitles(movie_id)`);
}

/**
 * Ensure files table has all required columns (idempotent)
 */
function ensureFilesColumns(db: any): void {
  // Get current table info
  const tableInfo = db.prepare('PRAGMA table_info(files)').all() as Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: any;
    pk: number;
  }>;
  
  const existingColumns = new Set(tableInfo.map(col => col.name));
  
  // Add missing columns if they don't exist
  const requiredColumns = [
    { name: 'mime_type', type: 'TEXT', defaultValue: null },
    { name: 'duration_sec', type: 'INTEGER', defaultValue: null },
    { name: 'width', type: 'INTEGER', defaultValue: null },
    { name: 'height', type: 'INTEGER', defaultValue: null },
    { name: 'video_codec', type: 'TEXT', defaultValue: null },
    { name: 'audio_codec', type: 'TEXT', defaultValue: null }
  ];
  
  for (const column of requiredColumns) {
    if (!existingColumns.has(column.name)) {
      const defaultClause = column.defaultValue !== null ? ` DEFAULT ${column.defaultValue}` : '';
      db.exec(`ALTER TABLE files ADD COLUMN ${column.name} ${column.type}${defaultClause}`);
      console.log(`Added column ${column.name} to files table`);
    }
  }
}

/**
 * Ensure movies table has all metadata columns (idempotent)
 */
function ensureMoviesColumns(db: any): void {
  const tableInfo = db.prepare('PRAGMA table_info(movies)').all() as Array<{ name: string }>;
  const existing = new Set(tableInfo.map(col => col.name));

  const required = [
    { name: 'plot',      type: 'TEXT' },
    { name: 'rating',    type: 'REAL' },
    { name: 'genres',    type: 'TEXT' },
    { name: 'director',  type: 'TEXT' },
    { name: 'language',  type: 'TEXT' },
    { name: 'runtime',   type: 'INTEGER' },
    { name: 'thumbnail', type: 'TEXT' },
    { name: 'imdb_id',   type: 'TEXT' },
    { name: 'tmdb_id',   type: 'INTEGER' },
  ];

  for (const col of required) {
    if (!existing.has(col.name)) {
      db.exec(`ALTER TABLE movies ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to movies table`);
    }
  }
}

/**
 * Get all categories
 */
export function getCategories(): Category[] {
  const db = getDb();
  const stmt = db.prepare('SELECT id, name FROM categories ORDER BY name');
  return stmt.all() as Category[];
}

/**
 * Get categories for a specific movie
 */
export function getMovieCategories(movieId: number): Category[] {
  const db = getDb();
  const stmt = db.prepare(`
    SELECT c.id, c.name 
    FROM categories c
    JOIN movie_categories mc ON c.id = mc.category_id
    WHERE mc.movie_id = ?
    ORDER BY c.name
  `);
  return stmt.all(movieId) as Category[];
}

/**
 * Set categories for a movie (replaces existing categories)
 */
export function setMovieCategories(movieId: number, categoryNames: string[]): void {
  const db = getDb();
  
  db.transaction(() => {
    // Remove existing categories for this movie
    const deleteStmt = db.prepare('DELETE FROM movie_categories WHERE movie_id = ?');
    deleteStmt.run(movieId);
    
    // Add new categories
    if (categoryNames.length > 0) {
      const insertCategoryStmt = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
      const getCategoryStmt = db.prepare('SELECT id FROM categories WHERE name = ?');
      const linkStmt = db.prepare('INSERT INTO movie_categories (movie_id, category_id) VALUES (?, ?)');
      
      for (const categoryName of categoryNames) {
        // Ensure category exists
        insertCategoryStmt.run(categoryName);
        
        // Get category ID
        const category = getCategoryStmt.get(categoryName) as { id: number } | undefined;
        if (category) {
          linkStmt.run(movieId, category.id);
        }
      }
    }
  })();
}

/**
 * Initialize database with migrations on first import
 * This ensures migrations run when the module is imported
 */
if (typeof window === 'undefined') {
  // Only run on server side
  try {
    runMigrations();
  } catch (error) {
    console.error('Failed to run initial migrations:', error);
  }
}