import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // 1. In Production, we MUST use the volume-mounted database
    // 2. In Development, we use the local file in the root
    const isProd = process.env.NODE_ENV === 'production';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    
    const defaultPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'media.db');
    const prodPath = '/app/media.db';
    
    // Use environment variable if provided, otherwise pick based on environment
    let dbPath = process.env.DB_PATH || (isProd ? prodPath : defaultPath);

    console.log(`[Database] Initializing connection to: ${dbPath} (Mode: ${isProd ? 'Production' : 'Development'})`);

    // Build-time resilience
    if (!fs.existsSync(dbPath)) {
        if (isBuild) {
            console.warn('Build Phase: Using in-memory DB.');
            db = new Database(':memory:');
            return db;
        }
        // If we're not building and it's missing, try fallback to default
        if (fs.existsSync(defaultPath)) {
            dbPath = defaultPath;
        } else {
            console.warn(`Database not found at ${dbPath}, creating in-memory fallback.`);
            db = new Database(':memory:');
            return db;
        }
    }

    db = new Database(dbPath, { readonly: false });
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
