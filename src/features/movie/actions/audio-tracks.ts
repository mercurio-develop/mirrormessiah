'use server';

import { listAudioTracks, remuxAudioTrack } from '@/lib/audio-remux';
export type { AudioTrackInfo } from '@/lib/audio-remux';

export async function getAudioTracks(encodedPath: string) {
  return listAudioTracks(encodedPath);
}

export async function setDefaultAudioTrack(encodedPath: string, trackIndex: number) {
  return remuxAudioTrack(encodedPath, trackIndex);
}
