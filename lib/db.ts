import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'media.db');
    
    if (!fs.existsSync(dbPath)) {
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
