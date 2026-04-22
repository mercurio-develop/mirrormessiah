import { NextResponse } from 'next/server';
import { getCategories } from '@/lib/db_migrate';

/**
 * GET /api/categories
 * Returns all available categories
 */
export async function GET() {
  try {
    const categories = getCategories();
    
    return NextResponse.json({
      categories
    });
    
  } catch (error) {
    console.error('Error fetching categories:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}