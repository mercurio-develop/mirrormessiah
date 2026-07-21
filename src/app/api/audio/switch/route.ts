import { NextRequest, NextResponse } from 'next/server';
import { requireGateKey } from '@/lib/auth';
import { remuxAudioTrack } from '@/lib/audio-remux';

export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    await requireGateKey(request);
  } catch {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { path?: string; trackIndex?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { path: encodedPath, trackIndex } = body;
  if (!encodedPath || typeof trackIndex !== 'number') {
    return NextResponse.json({ error: 'path and trackIndex are required' }, { status: 400 });
  }

  const result = await remuxAudioTrack(encodedPath, trackIndex);
  if (!result.success) {
    return NextResponse.json(
      { success: false, error: result.error || 'Failed to switch audio track' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, encodedPath: result.encodedPath });
}
