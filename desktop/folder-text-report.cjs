'use strict';
const MAX_REPORT_BYTES = 10 * 1024 * 1024;
const MAX_REPORT_LINES = 50000;
// Only native loaded-row authority supplies paths. This reader never lists a folder
// or activates a child editor; the caller checks that its session is still active.
async function readFolderTextReport(service, tree, ids, revision, assertActive = () => {}, encoding='auto') {
  const encodings=require('./folder-rules.cjs').validateFolderTextEncodings(encoding);
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))) throw Error('Select between 1 and 20 loaded text-file rows.');
  assertActive();
  const rows = [];
  let bytes = 0;
  for (const id of ids) {
    const row = await tree.resolveRow(id, revision);
    if (row.kind !== 'file' || row.alignmentConflict || ['kindA', 'kindB'].some(key => row[key] !== null && row[key] !== 'file')) throw Error('Select regular files only, without folder or alignment conflicts.');
    bytes += (row.sizeA || 0) + (row.sizeB || 0);
    if (bytes > MAX_REPORT_BYTES) throw Error('Selected text files exceed the 10 MiB total report limit.');
    rows.push(row);
  }
  const assertRow = async row => {
    const current = await tree.resolveRow(row.id, revision);
    for (const key of ['pathA', 'pathB', 'kindA', 'kindB', 'versionA', 'versionB', 'alignmentRevision', 'alignmentConflict']) {
      if (current[key] !== row[key]) throw Error('A selected file changed while generating the report. Refresh and try again.');
    }
  };
  const result = {leftRoot: service.roots.a || null, rightRoot: service.roots.b || null, files: []};
  let lines = 0;
  for (const row of rows) {
    assertActive();
    const file = {id: row.id, pathA: row.pathA, pathB: row.pathB, left: null, right: null};
    for (const [side, key, output] of [['a', 'pathA', 'left'], ['b', 'pathB', 'right']]) {
      if (row[key] === null) continue;
      await assertRow(row);
      const {content, format} = await (encodings[side]==='auto'?service.read(side,row[key]):service.read(side,row[key],encodings[side]));
      await assertRow(row);
      // A trailing newline has an empty final line, matching the text diff engine.
      lines += content.split(/\r\n|\r|\n/).length;
      if (lines > MAX_REPORT_LINES) throw Error('Selected text files exceed the 50,000 total line report limit.');
      file[output] = {content, format};
    }
    result.files.push(file);
  }
  for (const row of rows) await assertRow(row);
  assertActive();
  return result;
}
module.exports = {readFolderTextReport, MAX_REPORT_BYTES, MAX_REPORT_LINES};
