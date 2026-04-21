import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { lookup } from 'mime-types';
import { validateFilePath, b64urlDecode } from '@/lib/pathenc';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pathParam = searchParams.get('path');

    if (!pathParam) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }

    let filePath: string;
    // Check if it's base64 encoded (starts with a-z, A-Z, 0-9, -, _)
    // or if it's a direct path. We'll try to decode it if it looks like base64.
    try {
      if (!pathParam.startsWith('/') && !pathParam.startsWith('http')) {
        filePath = b64urlDecode(pathParam);
      } else {
        filePath = pathParam;
      }
    } catch {
      filePath = pathParam;
    }

    // Security check - Ensure the path is within allowed libraries
    const isValid = await validateFilePath(filePath);
    
    if (!isValid) {
      console.warn(`[ImageProxy] Access Denied: ${filePath}`);
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      const placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="#1a1a1a"/><text x="150" y="230" text-anchor="middle" fill="#444" font-size="14" font-family="sans-serif">No Poster</text></svg>';
      return new NextResponse(placeholder, {
        headers: { 
            'Content-Type': 'image/svg+xml', 
            'Cache-Control': 'public, max-age=3600' 
        },
      });
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
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
