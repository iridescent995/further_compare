'use strict';
// Independent byte fixtures: never use the production encoder as the test oracle.
function bytes(text, encoding, bom = true) {
  if (encoding === 'utf8') return Buffer.concat([bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(text)]);
  const little = encoding.endsWith('le');
  if (encoding.startsWith('utf16')) {
    const body = Buffer.from(text, 'utf16le');
    if (!little) body.swap16();
    return Buffer.concat([bom ? Buffer.from(little ? [0xff, 0xfe] : [0xfe, 0xff]) : Buffer.alloc(0), body]);
  }
  if (encoding.startsWith('utf32')) {
    const points = Array.from(text, char => char.codePointAt(0)), body = Buffer.alloc(points.length * 4);
    points.forEach((point, index) => little ? body.writeUInt32LE(point, index * 4) : body.writeUInt32BE(point, index * 4));
    return Buffer.concat([bom ? Buffer.from(little ? [0xff, 0xfe, 0, 0] : [0, 0, 0xfe, 0xff]) : Buffer.alloc(0), body]);
  }
  throw Error('Unsupported fixture encoding ' + encoding);
}
const encodings = ['utf16le', 'utf16be', 'utf32le', 'utf32be', 'utf8'];
const original = 'café Ω 東京 😀\r\nunchanged\r\n';
const edited = 'café Ω 東京 😀\nchanged λ 🚀\n';
const crlf = text => text.replace(/\r\n|\r|\n/g, '\r\n');
module.exports = { bytes, encodings, original, edited, crlf };
