'use strict';
const {replaceBinaryRange} = require('./binary-edits.cjs');

class BinaryEditHistory {
  #undo = [];
  #redo = [];
  #maxEntries;
  #maxBytes;
  #snapshots = new WeakMap();
  constructor({maxEntries = 100, maxBytes = 32 * 1024 * 1024} = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 100) throw new RangeError('Binary history entries must be from 1 to 100.');
    if (!Number.isInteger(maxBytes) || maxBytes < 0 || maxBytes > 32 * 1024 * 1024) throw new RangeError('Binary history storage must be from 0 to 32 MiB.');
    this.#maxEntries = maxEntries;
    this.#maxBytes = maxBytes;
  }
  get canUndo() { return this.#undo.length > 0; }
  get canRedo() { return this.#redo.length > 0; }
  clear() { this.#undo = []; this.#redo = []; }
  #clone(entries) {
    return entries.map(entry => ({...entry, removed: Uint8Array.from(entry.removed)}));
  }
  // Tokens carry no serializable data and are accepted only by their creator.
  // Copies in both directions keep retained tab snapshots independent of edits.
  capture() {
    const token = Object.freeze({});
    this.#snapshots.set(token, {undo: this.#clone(this.#undo), redo: this.#clone(this.#redo)});
    return token;
  }
  restore(token) {
    const snapshot = token && typeof token === 'object' ? this.#snapshots.get(token) : null;
    if (!snapshot) return false;
    this.#undo = this.#clone(snapshot.undo);
    this.#redo = this.#clone(snapshot.redo);
    return true;
  }
  #trim(other, active) {
    let entries = other.length + active.length;
    let size = [...other, ...active].reduce((sum, entry) => sum + entry.removed.length, 0);
    // Both stacks are ordered oldest/farthest to nearest. Removing from the
    // front preserves a continuous sequence from the current file state.
    while (entries > this.#maxEntries || size > this.#maxBytes) {
      const removed = (other.length ? other : active).shift();
      size -= removed.removed.length;
      entries--;
    }
  }
  apply(bytes, start, end, replacement) {
    // Validate and build the result before changing history, even for no-ops.
    const result = replaceBinaryRange(bytes, start, end, replacement);
    if (end - start === replacement.length && replacement.every((value, index) => bytes[start + index] === value)) return bytes;
    this.#redo = [];
    this.#undo.push(result.undo);
    this.#trim(this.#redo, this.#undo);
    return result.bytes;
  }
  #move(bytes, source, destination) {
    if (!source.length) return bytes;
    const edit = source.at(-1);
    // The inverse of undo is redo, and vice versa. This captures inserted bytes
    // only when needed and accounts for their storage as the stacks change.
    const result = replaceBinaryRange(bytes, edit.offset, edit.offset + edit.insertedLength, edit.removed);
    source.pop();
    destination.push(result.undo);
    this.#trim(source, destination);
    return result.bytes;
  }
  undo(bytes) { return this.#move(bytes, this.#undo, this.#redo); }
  redo(bytes) { return this.#move(bytes, this.#redo, this.#undo); }
}

module.exports = {BinaryEditHistory};
