import { NextRequest, NextResponse } from 'next/server';
import { requireGateKey } from '@/lib/auth';
import { resolveCachedAudioPath } from '@/lib/audio-remux';

export async function GET(request: NextRequest) {
  try {
    await requireGateKey(request);
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const source = request.nextUrl.searchParams.get('source');
  const trackRaw = request.nextUrl.searchParams.get('track');
  const trackIndex = trackRaw ? parseInt(trackRaw, 10) : NaN;

  if (!source || Number.isNaN(trackIndex)) {
    return NextResponse.json({ error: 'source and track are required' }, { status: 400 });
  }

  const encodedPath = await resolveCachedAudioPath(source, trackIndex);
  if (!encodedPath) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({ valid: true, encodedPath });
}
