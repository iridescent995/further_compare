'use strict';

const WORKBOOK_VIEW_FLAGS = Object.freeze({showGridLines:true,rightToLeft:false,showFormulas:false,showRowColHeaders:true,showZeros:true,showRuler:true,showOutlineSymbols:true,showWhiteSpace:true});
const MAX_ROWS = 50000, MAX_COLUMNS = 512, MAX_MERGES = 50000;
function object(value, allowed, label) {
  if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new TypeError(`${label} must be a plain object.`);
  const out = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !allowed.includes(key) || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`Invalid ${label} property.`);
    out[key] = descriptor.value;
  }
  return out;
}
function array(value, limit, label) {
  if (!Array.isArray(value) || value.length > limit) throw new TypeError(`Invalid or oversized ${label}.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) throw new TypeError(`${label} must be a dense array without extra properties.`);
  const out = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`Invalid ${label} item.`);
    out.push(descriptor.value);
  }
  return out;
}
function dimension(value, maximum, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) throw new TypeError(`Invalid ${label}.`);
  return value === 0 ? 0 : value;
}
function columnName(index) {
  let name = '';
  for (; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
}
function range(value) {
  if (typeof value !== 'string' || value.length > 32) throw new TypeError('Invalid merged range.');
  const match = /^([A-Z]{1,3})([1-9]\d{0,4}):([A-Z]{1,3})([1-9]\d{0,4})$/.exec(value);
  if (!match) throw new TypeError('Merged ranges must use A1:B2 coordinates.');
  const col = letters => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const c1 = col(match[1]), r1 = Number(match[2]), c2 = col(match[3]), r2 = Number(match[4]);
  if (c1 > c2 || r1 > r2 || c2 > MAX_COLUMNS || r2 > MAX_ROWS || c1 === c2 && r1 === r2) throw new TypeError('Merged range is reversed, a single cell, or outside workbook limits.');
  return {value, c1, c2, r1, r2};
}
function normalizeWorkbookLayout(raw = {}) {
  const input = object(raw, ['merges', 'rows', 'columns', 'defaults', 'views'], 'workbook layout');
  const sourceDefaults = object(input.defaults === undefined ? {} : input.defaults, ['defaultRowHeight', 'defaultColWidth'], 'layout defaults');
  const defaults = {};
  for (const [key, max] of [['defaultRowHeight', 409], ['defaultColWidth', 255]]) if (sourceDefaults[key] !== undefined) defaults[key] = dimension(sourceDefaults[key], max, key);
  function entries(source, type, limit, field, defaultKey, maximum) {
    const seen = new Set(), result = [];
    for (const rawEntry of array(source === undefined ? [] : source, limit, type)) {
      const entry = object(rawEntry, ['index', field, 'hidden', 'outlineLevel'], type);
      if (!Number.isInteger(entry.index) || entry.index < 1 || entry.index > limit || seen.has(entry.index)) throw new TypeError(`Invalid or duplicate ${type} index.`);
      seen.add(entry.index);
      const normalized = {index: entry.index};
      if (entry[field] !== undefined) {
        const value = dimension(entry[field], maximum, field);
        if (value !== defaults[defaultKey]) normalized[field] = value;
      }
      if (entry.hidden !== undefined && typeof entry.hidden !== 'boolean') throw new TypeError(`Invalid ${type} hidden state.`);
      if (entry.hidden) normalized.hidden = true;
      if (entry.outlineLevel !== undefined && (!Number.isInteger(entry.outlineLevel) || entry.outlineLevel < 0 || entry.outlineLevel > 7)) throw new TypeError(`Invalid ${type} outline level.`);
      if (entry.outlineLevel) normalized.outlineLevel = entry.outlineLevel;
      if (Object.keys(normalized).length > 1) result.push(normalized);
    }
    return result.sort((a, b) => a.index - b.index);
  }
  const merges = array(input.merges === undefined ? [] : input.merges, MAX_MERGES, 'merged ranges').map(range).sort((a, b) => a.r1 - b.r1 || a.c1 - b.c1 || a.r2 - b.r2 || a.c2 - b.c2);
  const lastRows = new Uint32Array(MAX_COLUMNS + 1);
  for (const merged of merges) for (let column = merged.c1; column <= merged.c2; column++) {
    if (lastRows[column] >= merged.r1) throw new TypeError('Merged ranges must not overlap or repeat.');
    lastRows[column] = merged.r2;
  }
  const viewIds = new Map(), views = [];
  for (const rawView of array(input.views === undefined ? [] : input.views, 64, 'worksheet views')) {
    const view = object(rawView, ['id','state','xSplit','ySplit','paneTopLeftCell',...Object.keys(WORKBOOK_VIEW_FLAGS),'zoomScale','view'], 'worksheet view');
    if (!Number.isInteger(view.id) || view.id < 0 || view.id > 4294967295) throw new TypeError('Invalid worksheet view ID.');
    const normalized = {id:view.id};
    for (const [key, fallback] of Object.entries(WORKBOOK_VIEW_FLAGS)) {
      if (view[key] !== undefined && typeof view[key] !== 'boolean') throw new TypeError('Invalid worksheet view flag.');
      if (view[key] !== undefined && view[key] !== fallback) normalized[key] = view[key];
    }
    if (view.zoomScale !== undefined) {if (!Number.isInteger(view.zoomScale) || view.zoomScale < 10 || view.zoomScale > 400) throw new TypeError('Invalid worksheet zoom.');if (view.zoomScale !== 100) normalized.zoomScale = view.zoomScale;}
    if (view.view !== undefined) {if (!['normal','pageBreakPreview','pageLayout'].includes(view.view)) throw new TypeError('Invalid worksheet view mode.');if (view.view !== 'normal') normalized.view = view.view;}
    if (['state','xSplit','ySplit','paneTopLeftCell'].some(key=>view[key] !== undefined)) {
      const state = view.state === undefined ? 'split' : view.state;
      if (!['split','frozen','frozenSplit'].includes(state)) throw new TypeError('Invalid worksheet pane state.');
      const x = dimension(view.xSplit === undefined ? 0 : view.xSplit, Number.MAX_SAFE_INTEGER, 'horizontal pane split');
      const y = dimension(view.ySplit === undefined ? 0 : view.ySplit, Number.MAX_SAFE_INTEGER, 'vertical pane split');
      if (state !== 'split' && (!Number.isInteger(x) || !Number.isInteger(y) || x > 16384 || y > 1048576)) throw new TypeError('Invalid frozen pane row or column count.');
      if (x || y || state !== 'split' || view.paneTopLeftCell !== undefined) {normalized.state = state;normalized.xSplit = x;normalized.ySplit = y;}
      if (view.paneTopLeftCell !== undefined) {
        const match = typeof view.paneTopLeftCell === 'string' && /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(view.paneTopLeftCell);
        if (!match || [...match[1]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)>16384 || Number(match[2])>1048576) throw new TypeError('Invalid pane top-left cell.');
        normalized.paneTopLeftCell = view.paneTopLeftCell;
      }
    }
    // OOXML loads the last sheetView for a repeated workbookViewId.
    viewIds.set(view.id,normalized);
  }
  views.push(...[...viewIds.values()].filter(view=>Object.keys(view).length>1));
  views.sort((a,b)=>a.id-b.id);
  return {merges: merges.map(item => item.value), rows: entries(input.rows, 'rows', MAX_ROWS, 'height', 'defaultRowHeight', 409), columns: entries(input.columns, 'columns', MAX_COLUMNS, 'width', 'defaultColWidth', 255), defaults, ...(views.length ? {views} : {})};
}
function compareWorkbookLayouts(left, right) {
  const a = normalizeWorkbookLayout(left), b = normalizeWorkbookLayout(right), changes = [];
  for (const key of ['defaultRowHeight', 'defaultColWidth']) if (a.defaults[key] !== b.defaults[key]) changes.push({kind: 'default', location: key, left: a.defaults[key] ?? null, right: b.defaults[key] ?? null});
  const leftViews = new Map((a.views || []).map(view=>[view.id,view])), rightViews = new Map((b.views || []).map(view=>[view.id,view]));
  for (const id of [...new Set([...leftViews.keys(),...rightViews.keys()])].sort((x,y)=>x-y)) {
    const l=leftViews.get(id) || null,r=rightViews.get(id) || null;
    if (JSON.stringify(l)!==JSON.stringify(r)) changes.push({kind:'view',location:`View ${id}`,left:l,right:r});
  }
  const leftMerges = new Set(a.merges), rightMerges = new Set(b.merges);
  for (const location of a.merges) if (!rightMerges.has(location)) changes.push({kind: 'merge', location, left: location, right: null});
  for (const location of b.merges) if (!leftMerges.has(location)) changes.push({kind: 'merge', location, left: null, right: location});
  for (const [key, kind] of [['rows', 'row'], ['columns', 'column']]) {
    const leftEntries = new Map(a[key].map(entry => [entry.index, entry])), rightEntries = new Map(b[key].map(entry => [entry.index, entry]));
    for (const index of [...new Set([...leftEntries.keys(), ...rightEntries.keys()])].sort((x, y) => x - y)) {
      const l = leftEntries.get(index) ?? null, r = rightEntries.get(index) ?? null;
      if (JSON.stringify(l) !== JSON.stringify(r)) changes.push({kind, location: kind === 'row' ? `Row ${index}` : `Column ${columnName(index)}`, left: l, right: r});
    }
  }
  return {equal: changes.length === 0, changes};
}
module.exports = {normalizeWorkbookLayout, compareWorkbookLayouts, WORKBOOK_VIEW_FLAGS};
