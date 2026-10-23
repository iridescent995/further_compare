/**
 * Project a comparison into display entries without changing engine row/hunk
 * coordinates. Row entries retain the exact original row object and its index.
 * Context gaps represent contiguous excluded rows; index is the first hidden row.
 */
function filterRows(result, mode = 'all', showMinor = false) {
  if (!['all', 'diff', 'same', 'context'].includes(mode)) {
    throw new RangeError(`Unknown comparison view: ${mode}`);
  }
  const rows = result.rows;
  const isDifference = row => row.type !== 'equal' || (showMinor && row.minor === true);
  if (mode !== 'context') {
    const entries = [];
    rows.forEach((row, index) => {
      if (mode === 'all' || (mode === 'same' ? !isDifference(row) : isDifference(row))) {
        entries.push({row, index});
      }
    });
    return entries;
  }

  // Mark the three neighboring rows on either side of every changed row. This
  // joins overlapping context windows and includes entire multi-line changes.
  const visible = new Uint8Array(rows.length);
  let hasChanges = false;
  rows.forEach((row, index) => {
    if (!isDifference(row)) return;
    hasChanges = true;
    visible.fill(1, Math.max(0, index - 3), Math.min(rows.length, index + 4));
  });
  if (!hasChanges) return rows.map((row, index) => ({row, index}));

  const entries = [];
  for (let index = 0; index < rows.length;) {
    if (visible[index]) {
      entries.push({row: rows[index], index});
      index++;
    } else {
      const start = index;
      while (index < rows.length && !visible[index]) index++;
      entries.push({gap: true, count: index - start, index: start});
    }
  }
  return entries;
}

module.exports = {filterRows};
