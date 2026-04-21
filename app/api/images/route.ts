import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import { validateFilePath } from '@/lib/pathenc';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');

    if (!filePath) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    // Security check - Ensure the path is within allowed libraries
    const isValid = await validateFilePath(filePath);
    if (!isValid) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const mimeType = lookup(filePath) || 'image/jpeg';
    
    // Validate it's actually an image
    if (!mimeType.startsWith('image/')) {
        return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    const fileBuffer = fs.readFileSync(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
