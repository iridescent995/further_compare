'use strict';
const { _electron: electron, expect: baseExpect } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { bytes, encodings, original, edited, crlf } = require('./merge-encoding-fixtures.cjs');
const expect = baseExpect.configure({ timeout: 15000 });
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'fc-merge-encoding-')));
  let app, page;
  try {
    const env = { ...process.env, FC_USER_DATA_DIR: path.join(root, 'profile') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.FC_SMOKE;
    app = await electron.launch({ ...(process.env.FC_TEST_EXECUTABLE ? { executablePath: process.env.FC_TEST_EXECUTABLE, args: [] } : { args: [path.resolve(__dirname, '..')] }), env, timeout: 30000 });
    page = await app.firstWindow(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await expect(page.locator('#welcome [data-command="new:text-merge3"]')).toBeVisible();
    // Welcome markup is static; menu IPC may precede registration on cold/Rosetta startup.
    // Renderer clears inert only after installing the menu callback and live commands.
    await page.waitForFunction(() => !document.body.inert && typeof document.getElementById('newTab').onclick === 'function');
    await expect(page.locator('body')).toHaveAttribute('aria-busy', 'false');
    await app.evaluate(({ dialog }) => {
      global.mergeEncoding = { files: [], output: '' };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [global.mergeEncoding.files.shift()] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: global.mergeEncoding.output });
      dialog.showMessageBox = async () => ({ response: 1 });
    });
    const host = page.locator('#dataWorkspace'), output = host.locator('.advanced-output');
    const source = side => host.locator('[data-merge-source="' + side + '"]');
    const button = name => host.getByRole('button', { name, exact: true });
    const command = action => app.evaluate(({ BrowserWindow }, action) => BrowserWindow.getAllWindows()[0].webContents.send('menu-action', action), action);
    async function native(label) {
      await app.evaluate(({ Menu, BrowserWindow }, label) => {
        const find = menu => { for (const item of menu.items) { if (item.label === label) return item; if (item.submenu) { const match = find(item.submenu); if (match) return match; } } };
        const item = find(Menu.getApplicationMenu()); if (!item) throw Error('Missing menu ' + label);
        item.click(item, BrowserWindow.getAllWindows()[0], {});
      }, label);
    }
    let serial = 0;
    async function save(expected, label) {
      const destination = path.join(root, 'merged-' + (++serial) + '.txt');
      await app.evaluate(({}, destination) => global.mergeEncoding.output = destination, destination);
      await button('Save result').click();
      await expect.poll(() => fs.readFile(destination).then(data => data.toString('hex')).catch(() => null), { message: label }).toBe(expected.toString('hex'));
    }
    for (const encoding of encodings) {
      const paths = ['base', 'left', 'right'].map(side => path.join(root, encoding + '-' + side + '.txt'));
      for (const file of paths) await fs.writeFile(file, bytes(original, encoding));
      await app.evaluate(({}, files) => global.mergeEncoding.files = files, paths);
      await command('new:text-merge3');
      await expect(button('Open base')).toBeVisible();
      for (const side of ['base', 'left', 'right']) {
        await button('Open ' + side).click();
        await expect(source(({ base: 'base', left: 'a', right: 'b' })[side])).toHaveValue(original.replace(/\r\n/g, '\n'));
        await expect(host).toHaveAttribute('aria-busy', 'false');
      }
      await expect(output).toHaveValue(original.replace(/\r\n/g, '\n'));
      await save(bytes(original, encoding), encoding + ': native open/save exact original bytes');
      await source('a').fill(edited);
      await source('a').evaluate(el => el.setSelectionRange(5, 8, 'backward'));
      await expect(output).toHaveValue(edited);
      await expect(source('a')).toBeFocused();
      assert.deepEqual(await source('a').evaluate(el => [el.selectionStart, el.selectionEnd, el.selectionDirection]), [5, 8, 'backward']);
      await save(bytes(crlf(edited), encoding), encoding + ': source edit roundtrip');
      await native('Undo Comparison Edit');
      await expect(source('a')).toHaveValue(original.replace(/\r\n/g, '\n'));
      await save(bytes(original, encoding), encoding + ': native undo restores original');
      await native('Redo Comparison Edit');
      await expect(output).toHaveValue(edited);
      const session = path.join(root, encoding + '.fcompare');
      await app.evaluate(({}, destination) => global.mergeEncoding.output = destination, session);
      await command('save-session');
      await expect.poll(() => fs.readFile(session, 'utf8').then(JSON.parse).catch(() => null)).not.toBe(null);
      await app.evaluate(({}, file) => global.mergeEncoding.files = [file], session);
      const oldSession = await page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(node => node.parentElement.dataset.sessionId);
      await command('open-session');
      await expect.poll(() => page.locator('#sessionTabs [role="tab"][aria-selected="true"]').evaluate(node => node.parentElement.dataset.sessionId)).not.toBe(oldSession);
      await expect(output).toHaveValue(edited);
      await save(bytes(crlf(edited), encoding), encoding + ': on-disk session restores format and text');
      await output.fill('manual résumé 🪐\n'); await output.blur();
      await save(bytes('manual résumé 🪐\r\n', encoding), encoding + ': manual result roundtrip');
      for (const file of paths) assert.deepEqual(await fs.readFile(file), bytes(original, encoding), 'Merge must not modify source files');
    }
    // Swapping moves each side's read codec and Unicode draft together.
    await command('new:text-merge3');
    await expect(button('Open base')).toBeVisible();
    await host.getByLabel('Left input encoding', { exact: true }).selectOption('utf16be');
    await host.getByLabel('Right input encoding', { exact: true }).selectOption('utf32le');
    const mixedPaths = ['utf8', 'utf16be', 'utf32le'].map((encoding, index) => path.join(root, 'mixed-' + index + '.txt'));
    for (let index = 0; index < mixedPaths.length; index++) await fs.writeFile(mixedPaths[index], bytes(original, ['utf8', 'utf16be', 'utf32le'][index]));
    await app.evaluate(({}, files) => global.mergeEncoding.files = files, mixedPaths);
    for (const side of ['base', 'left', 'right']) { await button('Open ' + side).click(); await expect(source(({ base: 'base', left: 'a', right: 'b' })[side])).toHaveValue(original.replace(/\r\n/g, '\n')); }
    await source('a').fill(edited);
    await expect(output).toHaveValue(edited);
    await native('Swap Sides');
    await expect(source('a')).toHaveValue(original.replace(/\r\n/g, '\n'));
    await expect(source('b')).toHaveValue(edited);
    await expect(host.getByLabel('Left input encoding', { exact: true })).toHaveValue('utf32le');
    await expect(host.getByLabel('Right input encoding', { exact: true })).toHaveValue('utf16be');
    await save(bytes(crlf(edited), 'utf8'), 'Swapping preserves the edited Unicode result and base output encoding');
    await native('Swap Sides');
    await expect(source('a')).toHaveValue(edited);
    await expect(source('b')).toHaveValue(original.replace(/\r\n/g, '\n'));
    await expect(host.getByLabel('Left input encoding', { exact: true })).toHaveValue('utf16be');
    await expect(host.getByLabel('Right input encoding', { exact: true })).toHaveValue('utf32le');
    await save(bytes(crlf(edited), 'utf8'), 'Swapping back restores encoded inputs and drafts');
    await page.screenshot({ path: process.env.FC_MERGE_SCREENSHOT || path.join(os.tmpdir(), 'fc-2.169-merge-encoding.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Merge encoding desktop passed: real native open/save UTF-8/16/32 BOM and CRLF, non-BMP source/manual edits, selection, native undo/redo, disk session restore and unchanged inputs.');
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => window.__fcAllowClose = true).catch(() => {});
    if (app) { await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await app.close().catch(() => {}); }
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
