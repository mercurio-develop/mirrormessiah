import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'media.db');
    
    // During build time, we might not have the DB file yet.
    // We check if we're in a build environment or if the file exists.
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    
    if (!fs.existsSync(dbPath)) {
        if (isBuild) {
            console.warn('Build Phase: Database file not found, creating temporary in-memory instance.');
            db = new Database(':memory:');
            return db;
        }
        throw new Error('Database access failure: ' + dbPath);
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
