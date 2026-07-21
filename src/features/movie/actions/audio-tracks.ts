'use server';

export type { AudioTrackInfo } from '@/lib/audio-remux';
export { listAudioTracks as getAudioTracks, remuxAudioTrack as setDefaultAudioTrack } from '@/lib/audio-remux';
