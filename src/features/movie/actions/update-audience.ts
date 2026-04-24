'use server';

import { getDb } from '@/lib/db';
import { requireAdminKeyAuth, AuthError } from '@/lib/auth';
import { ActionState } from '@/lib/action-state';
import { revalidatePath } from 'next/cache';

export async function updateAudienceAction(
  movieIds: number[],
  audience: 'family' | 'adult' | null
): Promise<ActionState> {
  try {
    await requireAdminKeyAuth();
    
    const db = getDb();
    
    // Start transaction for bulk update
    db.transaction(() => {
        const updateMovie = db.prepare("UPDATE movies SET audience = ?, updated_at = datetime('now') WHERE id = ?");
        const deleteCat = db.prepare('DELETE FROM movie_categories WHERE movie_id = ?');
        const insertCat = db.prepare('INSERT OR IGNORE INTO movie_categories (movie_id, category_id) VALUES (?, ?)');
        const getCatId = db.prepare('SELECT id FROM categories WHERE LOWER(name) = LOWER(?)');
        
        // Ensure categories exist
        db.prepare("INSERT OR IGNORE INTO categories (name) VALUES ('Family')").run();
        db.prepare("INSERT OR IGNORE INTO categories (name) VALUES ('Adult')").run();

        const catName = audience === 'family' ? 'Family' : audience === 'adult' ? 'Adult' : null;
        let catId: number | null = null;
        if (catName) {
            const row = getCatId.get(catName) as { id: number };
            catId = row?.id;
        }

        for (const id of movieIds) {
            updateMovie.run(audience, id);
            deleteCat.run(id);
            if (catId) {
                insertCat.run(id, catId);
            }
        }
    })();

    revalidatePath('/admin/movies');
    revalidatePath('/');
    
    return {
      status: 'success',
      message: `Updated audience for ${movieIds.length} movie(s).`,
    };
  } catch (error: any) {
    if (error instanceof AuthError) {
      return { status: 'error', message: error.message };
    }
    console.error('[updateAudienceAction] Failed:', error);
    return { status: 'error', message: 'Update failed: ' + error.message };
  }
}
