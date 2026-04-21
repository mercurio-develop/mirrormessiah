import { NextRequest, NextResponse } from 'next/server';
import { validateFilePath, convertSrtToVtt } from '@/lib/pathenc';
import { b64urlDecode } from '@/lib/b64url';
import { requireGateKey } from '@/lib/auth';
import fs from 'fs';

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    try {
      await requireGateKey(request);
    } catch (error) {
      return new NextResponse('Authentication required', { status: 401 });
    }

    const path = request.nextUrl.searchParams.get('path');
    if (!path) return new NextResponse('Missing path', { status: 400 });

    let filePath: string;
    try {
      filePath = b64urlDecode(path);
    } catch {
      return new NextResponse('Invalid path', { status: 400 });
    }

    const isValid = await validateFilePath(filePath);
    if (!isValid) return new NextResponse('Access denied', { status: 403 });

    if (!fs.existsSync(filePath)) return new NextResponse('Not found', { status: 404 });

    const raw = fs.readFileSync(filePath, 'utf-8');
    const isSrt = filePath.toLowerCase().endsWith('.srt');
    const body = isSrt ? convertSrtToVtt(raw) : raw;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Subtitle proxy error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
