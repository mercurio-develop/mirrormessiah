import { NextRequest, NextResponse } from 'next/server';
import { b64urlDecode, validateFilePath } from '@/lib/pathenc';
import fs from 'fs';

function srtToVtt(srt: string): string {
  return 'WEBVTT\n\n' +
    srt
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // SRT uses commas for milliseconds; VTT uses dots
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
      // Strip HTML tags not supported in VTT
      .replace(/<font[^>]*>/gi, '').replace(/<\/font>/gi, '')
      .trim();
}

export async function GET(request: NextRequest) {
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
  const body = isSrt ? srtToVtt(raw) : raw;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
