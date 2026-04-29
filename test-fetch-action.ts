import { getAudioTracks } from './src/features/movie/actions/audio-tracks';
const encodedPath = 'L21lZGlhL3R1c2hpdGEvVFVTSElUQV9XMTFfREFUQS9zZXJpZXMvRWwgRXRlcm5hdXRhICgyMDI1KS9TZWFzb24gMDEvUzAxRTAxIC0gQSBOaWdodCBvZiBDYXJkcy5tcDQ';
getAudioTracks(encodedPath).then(console.log).catch(console.error);