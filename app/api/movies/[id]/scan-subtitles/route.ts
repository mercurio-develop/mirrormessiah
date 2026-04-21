import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const LANG_MAP: Record<string, { code: string; label: string }> = {
  en: { code: 'eng', label: 'English' },
  eng: { code: 'eng', label: 'English' },
  english: { code: 'eng', label: 'English' },
  es: { code: 'spa', label: 'Español' },
  spa: { code: 'spa', label: 'Español' },
  spanish: { code: 'spa', label: 'Español' },
  fr: { code: 'fre', label: 'Français' },
  fre: { code: 'fre', label: 'Français' },
  french: { code: 'fre', label: 'Français' },
  de: { code: 'ger', label: 'Deutsch' },
  ger: { code: 'ger', label: 'Deutsch' },
  german: { code: 'ger', label: 'Deutsch' },
  pt: { code: 'por', label: 'Português' },
  por: { code: 'por', label: 'Português' },
  portuguese: { code: 'por', label: 'Português' },
  it: { code: 'ita', label: 'Italiano' },
  ita: { code: 'ita', label: 'Italiano' },
  italian: { code: 'ita', label: 'Italiano' },
  ja: { code: 'jpn', label: '日本語' },
  jpn: { code: 'jpn', label: '日本語' },
  japanese: { code: 'jpn', label: '日本語' },
};

function detectLangFromFilename(filename: string): { code: string; label: string } | null {
  // Matches patterns: movie.en.srt, movie.eng.srt, movie.english.srt
  // Also: movie_en.srt, movie-english.srt
  const stem = filename.replace(/\.(srt|vtt)$/i, '');
  const parts = stem.split(/[._\-\s]+/);

  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i].toLowerCase();
    if (LANG_MAP[candidate]) return LANG_MAP[candidate];
  }
  return null;
}

export const POST = withAdminAuth(async (
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const db = getDb();
  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
  if (!movie) return NextResponse.json({ error: 'Movie not found' }, { status: 404 });

  const files = db.prepare('SELECT path FROM files WHERE movie_id = ?').all(movieId) as { path: string }[];
  if (files.length === 0) return NextResponse.json({ found: 0, added: 0 });

  // Collect unique directories from all video files
  const dirs = [...new Set(files.map(f => path.dirname(f.path)))];

  const found: string[] = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (lower.endsWith('.srt') || lower.endsWith('.vtt')) {
        found.push(path.join(dir, entry));
      }
    }
  }

  let added = 0;
  const inserted: any[] = [];

  for (const filePath of found) {
    const filename = path.basename(filePath);
    const ext = filename.split('.').pop()!.toLowerCase() as 'srt' | 'vtt';
    const langInfo = detectLangFromFilename(filename);

    try {
      const size = fs.statSync(filePath).size;
      const result = db.prepare(
        'INSERT OR IGNORE INTO subtitles (movie_id, path, lang, label, format, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(movieId, filePath, langInfo?.code ?? null, langInfo?.label ?? null, ext, size);

      if (result.changes > 0) {
        added++;
        inserted.push({ path: filePath, lang: langInfo?.code, label: langInfo?.label, format: ext });
      }
    } catch {
      // skip unreadable files
    }
  }

  return NextResponse.json({ found: found.length, added, subtitles: inserted });
});
