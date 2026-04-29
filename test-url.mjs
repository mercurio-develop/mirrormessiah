const src = '/api/stream?path=L21lZGlhL3R1c2hpdGEvVFVTSElUQV9XMTFfREFUQS9zZXJpZXMvRWwgRXRlcm5hdXRhICgyMDI1KS9TZWFzb24gMDEvUzAxRTAxIC0gQSBOaWdodCBvZiBDYXJkcy5tcDQ';
const isAbsolute = src.startsWith('http://') || src.startsWith('https://');
const urlStr = isAbsolute ? src : `http://localhost${src.startsWith('/') ? '' : '/'}${src}`;
const url = new URL(urlStr);
console.log(url.searchParams.get('path'));