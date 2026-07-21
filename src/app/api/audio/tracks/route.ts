import { NextRequest, NextResponse } from 'next/server';
import { requireGateKey } from '@/lib/auth';
import { listAudioTracks } from '@/lib/audio-remux';

export async function GET(request: NextRequest) {
  try {
    await requireGateKey(request);
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const encodedPath = request.nextUrl.searchParams.get('path');
  if (!encodedPath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const tracks = await listAudioTracks(encodedPath);
  return NextResponse.json({ tracks });
}
