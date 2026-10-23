'use strict';
const { startMergeBrowserServer } = require('./merge-browser-server.cjs');
const { chromium, expect: baseExpect } = require('@playwright/test');
const { build } = require('esbuild');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { bytes, encodings, original, edited, crlf } = require('./merge-encoding-fixtures.cjs');
const expect = baseExpect.configure({ timeout: 15000 });
(async () => {
  const bundle = await build({ entryPoints: ['src/advanced.js'], bundle: true, write: false, format: 'iife', globalName: 'AdvancedHarness', platform: 'browser' });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const server = await startMergeBrowserServer();
  try {
    const page = await browser.newPage();
    await page.goto(server.url);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
      window.errors = [];
      window.ui = AdvancedHarness.createAdvanced({ host: document.querySelector('#host'), notify: (message, error) => { if (error) errors.push(message); } });
    });
    const host = page.locator('#host'), output = host.locator('.advanced-output');
    const source = side => host.locator('[data-merge-source="' + side + '"]');
    const button = name => host.getByRole('button', { name, exact: true });
    async function open(side, buffer, expected = original.replace(/\r\n/g, '\n')) {
      const picker = page.waitForEvent('filechooser');
      await button('Open ' + side).click();
      await (await picker).setFiles({ name: side + '.txt', mimeType: 'text/plain', buffer });
      await expect(source(({ base: 'base', left: 'a', right: 'b' })[side])).toHaveValue(expected);
      await expect(host).toHaveAttribute('aria-busy', 'false');
    }
    async function savedBytes() {
      const pending = page.waitForEvent('download');
      await button('Save result').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), 'merged.txt');
      return fs.readFile(await download.path());
    }
    for (const encoding of encodings) {
      await page.evaluate(() => ui.setType('text-merge3'));
      for (const side of ['base', 'left', 'right']) await open(side, bytes(original, encoding));
      await expect(output).toHaveValue(original.replace(/\r\n/g, '\n'));
      assert.deepEqual(await savedBytes(), bytes(original, encoding), encoding + ': original BOM/CRLF bytes survive browser download');
      await source('a').fill(edited);
      await source('a').evaluate(el => el.setSelectionRange(5, 8, 'backward'));
      await expect(output).toHaveValue(edited);
      await expect(source('a')).toBeFocused();
      assert.deepEqual(await source('a').evaluate(el => [el.selectionStart, el.selectionEnd, el.selectionDirection]), [5, 8, 'backward']);
      assert.deepEqual(await savedBytes(), bytes(crlf(edited), encoding), encoding + ': edited merge saves original format');
      await button('Undo edit').click();
      await expect(source('a')).toHaveValue(original.replace(/\r\n/g, '\n'));
      assert.deepEqual(await savedBytes(), bytes(original, encoding), encoding + ': undo restores bytes');
      await button('Redo edit').click();
      await expect(output).toHaveValue(edited);
      await page.evaluate(() => { const state = ui.getState(), runtime = ui.getRuntimeState(); ui.setType('binary-compare'); ui.setType('text-merge3', state, runtime); });
      assert.deepEqual(await savedBytes(), bytes(crlf(edited), encoding), encoding + ': tab restoration preserves format');
      await output.fill('manual résumé 🪐\n');
      await output.blur();
      assert.deepEqual(await savedBytes(), bytes('manual résumé 🪐\r\n', encoding), encoding + ': manual result uses same encoding');
    }
    // Different byte encodings of equal text must not create false conflicts.
    await page.evaluate(() => ui.setType('text-merge3'));
    await open('base', bytes(original, 'utf16le'));
    await open('left', bytes(original, 'utf8'));
    await open('right', bytes(original, 'utf32be'));
    await expect(host.locator('[data-merge-conflict]')).toHaveCount(0);
    assert.deepEqual(await savedBytes(), bytes(original, 'utf16le'), 'Base determines the default result format across mixed encodings');
    await host.getByLabel('Result encoding', { exact: true }).selectOption('utf32be');
    await host.getByLabel('Result line endings', { exact: true }).selectOption('lf');
    await host.getByLabel('Result BOM', { exact: true }).uncheck();
    assert.deepEqual(await savedBytes(), bytes(original.replace(/\r\n/g, '\n'), 'utf32be', false), 'Explicit result encoding/EOL/BOM settings control exact downloaded bytes');
    await host.getByLabel('Result encoding', { exact: true }).selectOption('windows1252');
    const rejection = await page.evaluate(async () => { try { await ui.saveResult(); return null; } catch (error) { return error.message; } });
    assert.match(rejection, /without data loss|cannot be represented/i, 'Unrepresentable output must fail before starting a download');
    await expect(output).toHaveValue(original.replace(/\r\n/g, '\n'));
    // Legacy input requires an explicit read encoding and preserves that output format.
    await page.evaluate(() => ui.setType('text-merge3'));
    for (const side of ['Base', 'Left', 'Right']) await host.getByLabel(side + ' input encoding', { exact: true }).selectOption('windows1252');
    const legacy = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x80, 13, 10]);
    for (const side of ['base', 'left', 'right']) await open(side, legacy, 'café €\n');
    assert.deepEqual(await savedBytes(), legacy, 'Explicit Windows-1252 decode and output preserve original bytes');
    assert.deepEqual(await page.evaluate(() => errors), []);
    // An invalid replacement must preserve the loaded source and saveable result.
    await page.evaluate(() => ui.setType('text-merge3'));
    for (const side of ['base', 'left', 'right']) await open(side, bytes(original, 'utf16le'));
    const beforeInvalid = await page.evaluate(() => ui.getState());
    const invalidPicker = page.waitForEvent('filechooser');
    await button('Open right').click();
    await (await invalidPicker).setFiles({ name: 'truncated.txt', mimeType: 'text/plain', buffer: Buffer.from([0xff, 0xfe, 0x41]) });
    await expect.poll(() => page.evaluate(() => errors.length)).toBe(1);
    assert.match(await page.evaluate(() => errors[0]), /Invalid UTF-16/i);
    assert.deepEqual(await page.evaluate(() => ui.getState()), beforeInvalid, 'Invalid encoded replacement cannot mutate merge state');
    assert.deepEqual(await savedBytes(), bytes(original, 'utf16le'), 'Prior result remains saveable after failed import');
    console.log('Merge encoding browser passed: real picker/download roundtrips UTF-8/16/32 BOM and CRLF, non-BMP text, source edits, selection, undo/redo, tab restore, manual result.');
  } finally { await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
