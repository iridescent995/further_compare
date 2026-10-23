'use strict';

// The caller runs this pure search in a time-limited worker when accepting regexes.
function filenameMatches(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length > 200000) {
    throw new Error('Filename search supports up to 200000 entries.');
  }
  const { query = '', matchCase = false, wholeWords = false, regex = false, left = false, right = false } = options;
  if (typeof query !== 'string' || query.length > 4096) {
    throw new Error('Filename search query must be a string of at most 4096 characters.');
  }
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || entry.name.length > 32768) {
      throw new Error('Filename search names must be strings of at most 32768 characters.');
    }
  }
  if (!query) return [];

  let source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWords) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  const pattern = new RegExp(source, matchCase ? 'u' : 'iu');
  const matches = [];
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (((entry.side === 'a' && left === true) || (entry.side === 'b' && right === true)) && pattern.test(entry.name)) {
      matches.push(index);
    }
  }
  return matches;
}

module.exports = { filenameMatches };
