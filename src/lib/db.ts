import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export * from './types';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const isProd = process.env.NODE_ENV === 'production';
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
    
    const devPath = path.join(process.cwd(), 'media.db');
    const prodPath = '/app/data/media.db';
    
    // Prioritize DB_PATH env, then prod path, then dev path
    const dbPath = process.env.DB_PATH || (isProd ? prodPath : devPath);

    // Build-phase resilience
    if (isBuild) {
        return new Database(':memory:');
    }

    const absoluteDbPath = path.resolve(dbPath);
    const dbDir = path.dirname(absoluteDbPath);

    try {
        // Ensure parent directory exists
        if (!fs.existsSync(dbDir)) {
            console.log(`[Database] Creating directory: ${dbDir}`);
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Diagnostic: Check if directory is writable
        try {
            fs.accessSync(dbDir, fs.constants.W_OK);
        } catch (e) {
            const stats = fs.statSync(dbDir);
            console.error(`[Database] PERMISSION_ERROR: Directory ${dbDir} is NOT writable.`);
            console.error(`[Database] Dir UID: ${stats.uid}, GID: ${stats.gid}, Mode: ${stats.mode}`);
            console.error(`[Database] Process UID: ${process.getuid?.()}, GID: ${process.getgid?.()}`);
        }

        db = new Database(absoluteDbPath, { 
            readonly: false, 
            timeout: 10000,
            // verbose: console.log 
        });
        db.pragma('foreign_keys = ON');
        db.pragma('journal_mode = WAL');
        
        // Initial health check - might fail if table doesn't exist yet (migrations will fix it)
        try {
            const count = db.prepare('SELECT COUNT(*) as c FROM movies').get() as { c: number };
            console.log(`[Database] SYNC_ACTIVE: ${absoluteDbPath} | MOVIES: ${count.c}`);
        } catch {
            console.log(`[Database] SYNC_PENDING: ${absoluteDbPath} (Awaiting migrations)`);
        }
    } catch (err: any) {
        console.error(`[Database] SYNC_FAILURE: ${err.message}`);
        console.error(`[Database] Attempted path: ${absoluteDbPath}`);
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
