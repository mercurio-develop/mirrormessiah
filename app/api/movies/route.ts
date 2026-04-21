import { NextRequest, NextResponse } from 'next/server';
import { getMovies } from '@/features/movie/queries/get-movies';
import { withAdminAuth } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    const genre = searchParams.get('genre');
    const quality = searchParams.get('quality');
    const year = searchParams.get('year');
    const sort = searchParams.get('sort') as 'newest' | 'title_asc' | 'title_desc' | null;
    const offset = parseInt(searchParams.get('offset') || '0');
    const limit = parseInt(searchParams.get('limit') || '24');

    const result = getMovies({ q, genre, quality, year, sort, offset, limit });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: 'Failed to fetch treasury entities' }, { status: 500 });
  }
}

/**
 * POST /api/movies
 * Initialize New Entity
 */
export const POST = withAdminAuth(async (request: Request) => {
  try {
    const body = await request.json();
    const db = getDb();
    
    const { 
      title, year, quality, imdb_id, tmdb_id, 
      thumbnail, plot, director, language, runtime,
      categories = [] 
    } = body;
    
    if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });

    const result = db.prepare(`
      INSERT INTO movies (
        title, year, quality, imdb_id, tmdb_id, 
        thumbnail, plot, director, language, runtime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, year, quality, imdb_id, tmdb_id, thumbnail, plot, director, language, runtime);
    
    const movieId = result.lastInsertRowid;
    
    if (categories.length > 0) {
      for (const catName of categories) {
        const cat = db.prepare("SELECT id FROM categories WHERE name = ?").get(catName) as any;
        if (cat) {
          db.prepare("INSERT INTO movie_categories (movie_id, category_id) VALUES (?, ?)").run(movieId, cat.id);
        }
      }
    }

    return NextResponse.json({ success: true, id: movieId });
  } catch (error: any) {
    return NextResponse.json({ error: 'Initialization failed: ' + error.message }, { status: 500 });
  }
});
