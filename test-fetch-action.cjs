const { execSync } = require('child_process');
const { b64urlDecode } = require('./src/lib/b64url.js') || {}; // Not compiled? I'll just write it manually

function decode(str) {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

const encodedPath = 'L21lZGlhL3R1c2hpdGEvVFVTSElUQV9XMTFfREFUQS9zZXJpZXMvRWwgRXRlcm5hdXRhICgyMDI1KS9TZWFzb24gMDEvUzAxRTAxIC0gQSBOaWdodCBvZiBDYXJkcy5tcDQ';
const filePath = decode(encodedPath);
console.log(filePath);

const stdout = execSync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`).toString();
const data = JSON.parse(stdout);
const audioStreams = data.streams?.filter((s) => s.codec_type === 'audio') || [];
console.log(audioStreams.map((s) => ({
  index: s.index,
  codec: s.codec_name,
  language: s.tags?.language || 'und',
  title: s.tags?.title || s.tags?.handler_name || 'Audio Track'
})));
