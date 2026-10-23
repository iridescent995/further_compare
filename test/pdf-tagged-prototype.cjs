'use strict';
// Test-only feasibility: page-local tagged paragraph order, not accessible replacement text.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const ROOT = path.join(__dirname, 'fixtures/pdf-tagged-independent');
function orderTaggedPage(tree, items) {
  const fail = message => { throw Error(message); };
  if (!tree) fail('Missing structure tree');
  if (items.length > 1000000) fail('Item budget');
  const groups = new Map(), stack = [];
  let size = 0;
  for (const item of items) {
    if (item.type === 'beginMarkedContent' || item.type === 'beginMarkedContentProps') {
      if (stack.length >= 128) fail('Marker depth');
      if (item.id) {
        if (groups.has(item.id)) fail('Duplicate marked-content ID');
        if (stack.some(x => x.id)) fail('Nested identified content');
        groups.set(item.id, []);
      }
      stack.push(item); continue;
    }
    if (item.type === 'endMarkedContent') {
      if (!stack.length) fail('Unbalanced marked content');
      stack.pop(); continue;
    }
    if (typeof item.str !== 'string') fail('Unknown text item');
    size += Buffer.byteLength(item.str) + 1;
    if (size > 8 * 1024 * 1024) fail('Text budget');
    const owner = stack.find(x => x.id);
    if (item.str.trim() && (stack.some(x => x.tag === 'Artifact') || !owner)) fail('Uncovered or artifact text');
    if (owner) groups.get(owner.id).push(item);
  }
  if (stack.length) fail('Unbalanced marked content');
  const seen = new Set(), blocks = []; let nodes = 0;
  function visit(node, depth, block) {
    if (++nodes > 200000 || depth > 128) fail('Structure budget');
    if ('alt' in node || 'actualText' in node) fail('Replacement/alternate text unsupported');
    if (node.type) {
      if (node.type !== 'content') fail('Object reference unsupported');
      if (!block) fail('Content outside paragraph');
      if (seen.has(node.id)) fail('Repeated structure reference');
      const values = groups.get(node.id);
      if (!values) fail('Missing referenced content');
      seen.add(node.id);
      for (const value of values) block.push(value); return;
    }
    if (!Array.isArray(node.children)) fail('Malformed structure');
    if (/^(P|H[1-6]|H)$/.test(node.role)) {
      if (block) fail('Nested paragraph');
      block = []; blocks.push(block);
    } else if (!['Root', 'Document', 'Part', 'Sect', 'Div', 'Span'].includes(node.role)) fail('Unqualified role: ' + node.role);
    for (const child of node.children) visit(child, depth + 1, block);
  }
  visit(tree, 0, null);
  for (const [id, values] of groups) if (!seen.has(id) && values.some(x => x.str.trim())) fail('Unreferenced text');
  // PDF.js emits geometry-derived leading empty EOL items. They are not paragraph content.
  return blocks.map(values => {
    let output = '';
    for (const item of values) {
      if (!output && !item.str) continue;
      output += item.str + (item.hasEOL ? '\n' : '');
    }
    return output.trim(); // Prototype normalizes paragraph-edge whitespace; production needs explicit policy.
  });
}
async function main() {
  let networkCalls = 0;
  const deny = () => { networkCalls++; throw Error('Network forbidden'); };
  for (const name of ['http', 'https']) require('node:' + name).request = require('node:' + name).get = deny;
  require('node:net').connect = require('node:net').createConnection = require('node:tls').connect = deny;
  globalThis.fetch = deny;
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await import(pathToFileURL(path.join(root, 'legacy/build/pdf.mjs')).href);
  assert.equal(pdfjs.version, '6.2.108');
  const expected = JSON.parse(fs.readFileSync(path.join(ROOT, 'expected.json'))).logicalParagraphs;
  const results = [];
  for (const name of ['baseline', 'drawing-row-major', 'untagged', 'duplicate-mcid', 'unmarked-text', 'artifact-text']) {
    const data = fs.readFileSync(path.join(ROOT, name + '.pdf')); assert(data.length < 32 * 1024 * 1024);
    const task = pdfjs.getDocument({data: new Uint8Array(data), verbosity: 0, stopAtErrors: true, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, useWorkerFetch: false, useWasm: false, enableXfa: false});
    try {
      const doc = await task.promise; assert.equal(doc.numPages, 1);
      const page = await doc.getPage(1), tree = await page.getStructTree();
      const {items} = await page.getTextContent({includeMarkedContent: true});
      if (name === 'baseline' || name === 'drawing-row-major') {
        const paragraphs = orderTaggedPage(tree, items); assert.deepEqual(paragraphs, expected);
        const drawOrder = items.filter(x => x.str).map(x => x.str);
        if (name === 'drawing-row-major') assert.notDeepEqual(drawOrder, expected);
        results.push({name, paragraphs, drawOrder});
        const clone = () => structuredClone(tree);
        const alternate = clone(); alternate.alt = 'replacement'; assert.throws(() => orderTaggedPage(alternate, items), /alternate/);
        const object = clone(); object.children.push({type:'object',id:'annotation'}); assert.throws(() => orderTaggedPage(object, items), /Object/);
        const missing = clone(); missing.children.push({role:'P',children:[{type:'content',id:'absent'}]}); assert.throws(() => orderTaggedPage(missing, items), /Missing referenced/);
        const repeated = clone(); repeated.children.push(structuredClone(tree.children[0].children[0])); assert.throws(() => orderTaggedPage(repeated, items), /Repeated/);
        assert.throws(() => orderTaggedPage(tree, [{type:'endMarkedContent'},...items]), /Unbalanced/);
      } else {
        let rejection; try { orderTaggedPage(tree, items); } catch (error) { rejection = error.message; }
        assert(rejection, name + ' must reject'); results.push({name,rejection});
      }
      page.cleanup();
    } finally { await task.destroy(); }
  }
  assert.equal(networkCalls, 0); console.log(JSON.stringify({prototype:true,version:pdfjs.version,networkCalls,results},null,2));
}
if (require.main === module) {
  if (process.argv.includes('--child')) main().catch(error => { console.error(error); process.exitCode=1; });
  else {
    const child = spawnSync(process.execPath,[__filename,'--child'],{timeout:30000,killSignal:'SIGKILL',maxBuffer:2*1024*1024,encoding:'utf8'});
    process.stdout.write(child.stdout || ''); process.stderr.write(child.stderr || '');
    if(child.error) console.error(child.error); process.exitCode=child.status === 0 && !child.error ? 0 : 1;
  }
}
module.exports={orderTaggedPage};
