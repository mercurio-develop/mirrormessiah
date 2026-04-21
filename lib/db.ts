import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const isProd = process.env.NODE_ENV === 'production';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    
    const defaultPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'media.db');
    const prodPath = '/app/data/media.db';
    
    // In Production, strictly follow DB_PATH or /app/media.db
    // In Dev, follow DB_PATH or the local root file
    let dbPath = process.env.DB_PATH || (isProd ? prodPath : defaultPath);

    // Build-phase resilience (keep this for Next.js compilation)
    if (isBuild) {
        console.warn('Build Phase: Using temporary in-memory database.');
        return new Database(':memory:');
    }

    // Runtime Check: If the file is missing, we need to know!
    if (!fs.existsSync(dbPath)) {
        console.error(`[Database] CRITICAL ERROR: Database file not found at: ${dbPath}`);
        console.error(`[Database] Available directory content: ${fs.readdirSync(path.dirname(dbPath)).join(', ')}`);
        
        // Fallback to local root only if in dev
        if (!isProd && fs.existsSync(defaultPath)) {
            dbPath = defaultPath;
        } else {
            throw new Error(`Registry Connection Failure: File not found at ${dbPath}`);
        }
    }

    try {
        db = new Database(dbPath, { readonly: false, timeout: 5000 });
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        
        const count = db.prepare('SELECT COUNT(*) as c FROM movies').get() as { c: number };
        console.log(`[Database] CONNECTED TO: ${dbPath} | ENTITIES_FOUND: ${count.c}`);
    } catch (err: any) {
        console.error(`[Database] CONNECTION_FAILURE: ${err.message}`);
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
