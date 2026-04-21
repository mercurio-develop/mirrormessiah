import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const defaultPath = path.join(/* turbopackIgnore: true */ process.cwd(), 'media.db');
    const dbPath = process.env.DB_PATH || defaultPath;
    
    // Check if the database file exists. 
    if (!fs.existsSync(dbPath)) {
        console.warn('Database file not found. Using temporary in-memory instance.');
        db = new Database(':memory:');
    } else {
        db = new Database(dbPath, { readonly: false });
    }
    
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
