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
      // 0. Base Tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS libraries (
          id         INTEGER PRIMARY KEY,
          name       TEXT NOT NULL,
          root_path  TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS movies (
          id          INTEGER PRIMARY KEY,
          library_id  INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          year        INTEGER,
          quality     TEXT,
          imdb_id     TEXT,
          tmdb_id     INTEGER,
          thumbnail   TEXT,
          plot        TEXT,
          rating      REAL,
          genres      TEXT,
          audience    TEXT CHECK(audience IN ('family', 'adult')) DEFAULT NULL,
          director    TEXT,
          language    TEXT,
          runtime     INTEGER,
          needs_repair INTEGER DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      // Migration: Ensure existing movies table has needs_repair column
      const movieColumns = db.prepare("PRAGMA table_info(movies)").all() as any[];

      // Migration: Ensure libraries table has a default entry
      const libraryCount = db.prepare('SELECT COUNT(*) as count FROM libraries').get() as { count: number };
      if (libraryCount.count === 0) {
          console.log('Seeding default library...');
          db.exec("INSERT INTO libraries (name, root_path) VALUES ('Default', '/')");
      }
      const defaultLibraryId = (db.prepare('SELECT id FROM libraries LIMIT 1').get() as { id: number }).id;

      // Migration: Ensure existing movies table has library_id column
      if (!movieColumns.some(col => col.name === 'library_id')) {
          console.log('Migrating movies table to add library_id column...');
          // SQLite doesn't support ADD COLUMN with REFERENCES in a single step for existing tables without complex reconstruction
          // but we can add it and then update.
          db.exec(`ALTER TABLE movies ADD COLUMN library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE`);
          db.prepare('UPDATE movies SET library_id = ?').run(defaultLibraryId);
      }

      if (!movieColumns.some(col => col.name === 'needs_repair')) {
          console.log('Migrating movies table to add needs_repair column...');
          db.exec("ALTER TABLE movies ADD COLUMN needs_repair INTEGER DEFAULT 0");
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id                INTEGER PRIMARY KEY,
          library_id        INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          movie_id          INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          path              TEXT NOT NULL UNIQUE,
          size_bytes        INTEGER,
          container         TEXT,
          original_path     TEXT,
          fallback_mp4_path TEXT,
          has_mp4_fallback  BOOLEAN DEFAULT 0,
          added_at          TEXT NOT NULL DEFAULT (datetime('now')),
          mime_type         TEXT,
          duration_sec      INTEGER,
          width             INTEGER,
          height            INTEGER,
          video_codec       TEXT,
          audio_codec       TEXT,
          language          TEXT
        )
      `);

      // 1. Extensions
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id    INTEGER PRIMARY KEY,
          name  TEXT NOT NULL UNIQUE
        )
      `);
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS movie_categories (
          movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          PRIMARY KEY (movie_id, category_id)
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS subtitles (
          id          INTEGER PRIMARY KEY,
          movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
          file_id     INTEGER REFERENCES files(id) ON DELETE CASCADE,
          path        TEXT NOT NULL UNIQUE,
          lang        TEXT,
          label       TEXT,
          format      TEXT,
          default_flag INTEGER DEFAULT 0,
          size_bytes  INTEGER
        )
      `);
      
      db.exec(`CREATE INDEX IF NOT EXISTS idx_subtitles_movie ON subtitles(movie_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_files_movie ON files(movie_id)`);

      // 2. Series Tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS series (
          id          INTEGER PRIMARY KEY,
          library_id  INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          title       TEXT NOT NULL,
          year        INTEGER,
          plot        TEXT,
          rating      REAL,
          tmdb_id     INTEGER,
          imdb_id     TEXT,
          thumbnail   TEXT,
          genres      TEXT,
          audience    TEXT CHECK(audience IN ('family', 'adult')) DEFAULT NULL,
          director    TEXT,
          language    TEXT,
          needs_repair INTEGER DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS seasons (
          id            INTEGER PRIMARY KEY,
          series_id     INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
          season_number INTEGER NOT NULL,
          title         TEXT,
          plot          TEXT,
          poster        TEXT,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(series_id, season_number)
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS episodes (
          id             INTEGER PRIMARY KEY,
          season_id      INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
          episode_number INTEGER NOT NULL,
          title          TEXT,
          plot           TEXT,
          runtime        INTEGER,
          thumbnail      TEXT,
          needs_repair   INTEGER DEFAULT 0,
          created_at     TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(season_id, episode_number)
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS episode_files (
          id                INTEGER PRIMARY KEY,
          library_id        INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
          episode_id        INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          path              TEXT NOT NULL UNIQUE,
          size_bytes        INTEGER,
          container         TEXT,
          added_at          TEXT NOT NULL DEFAULT (datetime('now')),
          mime_type         TEXT,
          duration_sec      INTEGER,
          width             INTEGER,
          height            INTEGER,
          video_codec       TEXT,
          audio_codec       TEXT,
          language          TEXT
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS episode_subtitles (
          id          INTEGER PRIMARY KEY,
          episode_id  INTEGER NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
          file_id     INTEGER REFERENCES episode_files(id) ON DELETE CASCADE,
          path        TEXT NOT NULL UNIQUE,
          lang        TEXT,
          label       TEXT,
          format      TEXT,
          default_flag INTEGER DEFAULT 0,
          size_bytes  INTEGER
        )
      `);

      db.exec(`CREATE INDEX IF NOT EXISTS idx_seasons_series ON seasons(series_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_episodes_season ON episodes(season_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_episode_subtitles_episode ON episode_subtitles(episode_id)`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_episode_files_episode ON episode_files(episode_id)`);

      // 3. Data Seeding
      const defaultCategories = ['Kids', 'Family', 'Adults'];
      const insertCategory = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
      for (const cat of defaultCategories) {
        insertCategory.run(cat);
      }

    })();
    
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running database migrations:', error);
    throw error;
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
 * Set categories for a movie
 */
export function setMovieCategories(movieId: number, categoryNames: string[]): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM movie_categories WHERE movie_id = ?').run(movieId);
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');
    const linkCat = db.prepare('INSERT INTO movie_categories (movie_id, category_id) VALUES (?, ?)');
    for (const name of categoryNames) {
      insertCat.run(name);
      const cat = getCat.get(name) as { id: number } | undefined;
      if (cat) linkCat.run(movieId, cat.id);
    }
  })();
}

/**
 * Initialize database with migrations on first import
 */
if (typeof window === 'undefined') {
  // Only run auto-migrations if NOT in the production build phase
  if (process.env.NEXT_PHASE !== 'phase-production-build') {
    try {
      runMigrations();
    } catch (error) {
      console.error('Failed to run initial migrations:', error);
    }
  } else {
    console.log('Build Phase: Skipping auto-migrations');
  }
}
