'use strict';
const path = require('node:path');
const {TextDecoder} = require('node:util');
const MAX_SHELL_URL_BYTES = 96 * 1024;
const commands = new Map([['--fc-set-left',1],['--fc-compare-left',1],['--fc-compare-selected',2]]);
function invalid() { throw new Error('Invalid Further Compare shell URL.'); }
function parseShellURL(value) {
  // Match the wire representation itself: URL normalization must not make a
  // different authority, escaped route, duplicate parameter or fragment valid.
  if (typeof value !== 'string' || value.length > MAX_SHELL_URL_BYTES) invalid();
  const match = /^furthercompare:\/\/shell\/v1\?payload=([A-Za-z0-9_-]+)$/.exec(value);
  if (!match || match[0] !== value) invalid();
  const bytes = Buffer.from(match[1], 'base64url');
  if (bytes.toString('base64url') !== match[1]) invalid();
  let json, request;
  try { json = new TextDecoder('utf-8', {fatal:true,ignoreBOM:true}).decode(bytes); request = JSON.parse(json); }
  catch { invalid(); }
  if (!request || Array.isArray(request) || typeof request !== 'object' || Object.keys(request).length !== 2 || !Object.hasOwn(request,'command') || !Object.hasOwn(request,'files')) invalid();
  // JSON.parse accepts duplicate keys. Count top-level member names before
  // accepting the parsed object, including escaped spellings of those names.
  let depth = 0;
  const names = new Set();
  const tokens = /"(?:[^"\\]|\\.)*"|[{}\[\]:]/g;
  for (const token of json.matchAll(tokens)) {
    const text = token[0];
    if (text === '{' || text === '[') depth++;
    else if (text === '}' || text === ']') depth--;
    else if (text[0] === '"' && depth === 1 && /^\s*:/.test(json.slice(token.index + text.length))) {
      const name = JSON.parse(text);
      if (names.has(name)) invalid();
      names.add(name);
    }
  }
  if (!commands.has(request.command) || !Array.isArray(request.files) || request.files.length !== commands.get(request.command)) invalid();
  for (const file of request.files) {
    if (typeof file !== 'string' || !file || file.length > 32768 || file.includes('\0') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(file) || !path.isAbsolute(file)) invalid();
  }
  return {command:request.command,files:[...request.files]};
}
module.exports = {parseShellURL,MAX_SHELL_URL_BYTES};
