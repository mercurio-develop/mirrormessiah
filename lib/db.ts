import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const isProd = process.env.NODE_ENV === 'production';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    
    const devPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'media.db');
    const prodPath = '/app/data/media.db';
    
    // In production, we force the mounted path to ensure data synchronization
    const dbPath = isProd ? prodPath : (process.env.DB_PATH || devPath);

    // Build-phase resilience
    if (isBuild) {
        return new Database(':memory:');
    }

    if (!fs.existsSync(dbPath)) {
        console.error(`[Database] ERROR: File not found at ${dbPath}`);
        
        // Fallback for dev only
        if (!isProd && fs.existsSync(devPath)) {
            return new Database(devPath);
        }
        
        throw new Error(`Registry Connection Failure: ${dbPath} not found.`);
    }

    try {
        db = new Database(dbPath, { readonly: false, timeout: 5000 });
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        
        const count = db.prepare('SELECT COUNT(*) as c FROM movies').get() as { c: number };
        console.log(`[Database] SYNC_ACTIVE: ${dbPath} | MOVIES: ${count.c}`);
    } catch (err: any) {
        console.error(`[Database] SYNC_FAILURE: ${err.message}`);
        throw err;
    }
  }

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
