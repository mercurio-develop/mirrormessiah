import { getAudioTracks } from './src/features/movie/actions/audio-tracks';
import { b64urlEncode } from './src/lib/b64url';

const path = '/media/tushita/TUSHITA_W11_DATA/series/El Eternauta (2025)/Season 01/S01E01 - A Night of Cards.mp4';
const encoded = b64urlEncode(path);

getAudioTracks(encoded).then(console.log).catch(console.error);
