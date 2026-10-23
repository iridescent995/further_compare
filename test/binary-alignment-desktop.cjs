'use strict';
// Exercise alignment, actual-offset editing, paging and persistence through the real desktop renderer.
const {_electron: electron, expect} = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-binary-alignment-'));
  let app, page;
  try {
    const fixtures = {
      'left.bin': Buffer.from([1, 2, 99, 3, 4]),
      'right.bin': Buffer.from([1, 2, 3, 4]),
      'empty.bin': Buffer.alloc(0),
      'large-left.bin': Buffer.alloc(150000, 1),
      'large-right.bin': Buffer.alloc(150000, 2),
    };
    fixtures['navigation-left.bin'] = Buffer.alloc(9000);
    fixtures['navigation-right.bin'] = Buffer.alloc(9000);
    for (const offset of [100, 3000, 5000]) fixtures['navigation-right.bin'][offset] = 255;
    let seed = 123456789;
    const base = Buffer.from(Array.from({length: 4200}, () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      return seed & 255;
    }));
    fixtures['page-right.bin'] = base;
    fixtures['page-left.bin'] = Buffer.concat([base.subarray(0, 4095), Buffer.from([base[4095] ^ 255]), base.subarray(4095)]);
    for (const [name, data] of Object.entries(fixtures)) await fs.writeFile(path.join(dir, name), data);
    const env = {...process.env, FC_USER_DATA_DIR: path.join(dir, 'profile')};
    delete env.ELECTRON_RUN_AS_NODE; delete env.FC_SMOKE;
    app = await electron.launch({...(process.env.FC_TEST_EXECUTABLE ? {executablePath: process.env.FC_TEST_EXECUTABLE, args: []} : {args: [path.resolve(__dirname, '..')]}), env});
    page = await app.firstWindow(); page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({dialog}) => {
      global.binaryTestFiles = []; global.binaryTestDestination = '';
      dialog.showOpenDialog = async () => ({canceled: false, filePaths: [global.binaryTestFiles.shift()]});
      dialog.showSaveDialog = async () => ({canceled: false, filePath: global.binaryTestDestination});
      dialog.showMessageBox = async () => ({response: 1});
    });
    const queue = names => app.evaluate(({}, names) => global.binaryTestFiles = names, names.map(name => path.join(dir, name)));
    const destination = name => app.evaluate(({}, value) => global.binaryTestDestination = value, path.join(dir, name));
    const menu = action => app.evaluate(({BrowserWindow}, action) => BrowserWindow.getAllWindows()[0].webContents.send('menu-action', action), action);
    const open = async (left, right) => {
      await queue([left, right]);
      await page.getByRole('button', {name: 'Open left', exact: true}).click();
      await page.getByRole('button', {name: 'Open right', exact: true}).click();
    };
    const panes = page.locator('.advanced-hex');
    const byte = (side, offset) => panes.nth(side).locator(`.advanced-byte[data-offset="${offset}"]`);
    const mode = page.getByLabel('Binary comparison', {exact: true});
    const note = page.locator('.advanced-note').first();
    await page.locator('#welcome [data-command="new:binary-compare"]').click();
    await open('left.bin', 'right.bin');
    await expect(mode).toHaveValue('aligned');
    await expect(note).toContainText('Insertion alignment');
    await expect(note).toContainText('1 differing byte');
    await expect(panes.nth(0).locator('.advanced-byte.changed')).toHaveCount(1);
    await expect(byte(0, 2)).toHaveText('63');
    await expect(byte(0, 2)).toHaveClass(/changed/);
    await expect(panes.nth(1).locator('.binary-gap')).toHaveCount(1);
    await expect(panes.nth(1).locator('.binary-gap')).toHaveText('··');
    assert.equal(await panes.nth(1).locator('.binary-gap').getAttribute('data-offset'), null);
    for (const [side, offset, value] of [[0, 3, '03'], [0, 4, '04'], [1, 2, '03'], [1, 3, '04']]) {
      await expect(byte(side, offset)).toHaveText(value);
      await expect(byte(side, offset)).not.toHaveClass(/changed/);
      assert.ok(await byte(side, offset).getAttribute('title'), 'Actual byte offset should be available in the tooltip');
    }
    await page.getByRole('button', {name: 'Next difference', exact: true}).click();
    await expect(byte(0, 2)).toHaveClass(/binary-current/);
    await expect(panes.nth(1).locator('.binary-gap')).toHaveClass(/binary-current/);
    await expect(page.locator('.binary-difference-position')).toHaveText('Difference 1 / 1');
    // Editing addresses the right file's byte 2, even though it appears at aligned column 3.
    await page.getByLabel('Byte offset (hex)').fill('2');
    await page.getByLabel('Right byte (hex)').fill('ff');
    await page.getByRole('button', {name: 'Apply byte', exact: true}).click();
    await expect(byte(1, 2)).toHaveText('ff');
    await destination('edited.bin');
    await page.getByRole('button', {name: 'Save result', exact: true}).click();
    await expect.poll(async () => [...await fs.readFile(path.join(dir, 'edited.bin'))]).toEqual([1, 2, 255, 4]);
    await page.getByRole('button', {name: 'Undo edit', exact: true}).click();
    await expect(byte(1, 2)).toHaveText('03');
    await expect(byte(1, 2)).not.toHaveClass(/changed/);
    await expect(note).toContainText('1 differing byte');
    await mode.selectOption('offset');
    await expect(note).toContainText('Offset comparison');
    await expect(note).toContainText('3 differing byte');
    await expect(byte(1, 2)).toHaveClass(/changed/);
    await expect(byte(1, 3)).toHaveClass(/changed/);
    // The chosen comparison mode survives a native session save and reopen.
    await page.locator('#sessionName').fill('Aligned bytes session');
    await destination('binary.fcompare'); await menu('save-session');
    await expect(page.locator('#dirtyIndicator')).toBeHidden();
    await menu('close-session'); await queue(['binary.fcompare']); await menu('open-session');
    await expect(page.locator('#sessionName')).toHaveValue('Aligned bytes session');
    await expect(mode).toHaveValue('offset');
    await expect(note).toContainText('3 differing byte');
    await mode.selectOption('aligned');
    await expect(note).toContainText('1 differing byte');
    await open('right.bin', 'left.bin');
    await expect(note).toContainText('1 differing byte');
    await expect(panes.nth(0).locator('.binary-gap')).toHaveCount(1);
    await expect(byte(1, 2)).toHaveText('63');
    await expect(byte(1, 2)).toHaveClass(/changed/);
    await expect(byte(0, 2)).not.toHaveClass(/changed/);
    await expect(byte(1, 3)).not.toHaveClass(/changed/);
    // Empty inputs have no fake bytes; a wholly missing side is represented by gaps.
    await open('empty.bin', 'empty.bin');
    await expect(note).toContainText('0 differing byte');
    await expect(panes.locator('.advanced-byte[data-offset]')).toHaveCount(0);
    await destination('empty-result.bin');
    await page.getByRole('button', {name: 'Save result', exact: true}).click();
    await expect.poll(async () => (await fs.stat(path.join(dir, 'empty-result.bin'))).size).toBe(0);
    await open('empty.bin', 'right.bin');
    await expect(note).toContainText('4 differing byte');
    await expect(panes.nth(0).locator('.binary-gap')).toHaveCount(4);
    await expect(panes.nth(1).locator('.advanced-byte[data-offset]')).toHaveCount(4);
    // A gap at the final column on page one must not shift or lose bytes on page two.
    await open('page-left.bin', 'page-right.bin');
    await expect(note).toContainText('1 differing byte');
    await expect(byte(0, 4095)).toHaveClass(/changed/);
    await expect(panes.nth(1).locator('.binary-gap')).toHaveCount(1);
    await page.getByRole('button', {name: 'Next page', exact: true}).click();
    await expect(byte(0, 4096)).toHaveText(base[4095].toString(16).padStart(2, '0'));
    await expect(byte(1, 4095)).toHaveText(base[4095].toString(16).padStart(2, '0'));
    await expect(panes.locator('.advanced-byte.changed')).toHaveCount(0);
    await expect(byte(0, 4200)).toHaveText(base[4199].toString(16).padStart(2, '0'));
    await expect(byte(1, 4199)).toHaveText(base[4199].toString(16).padStart(2, '0'));
    await page.getByRole('button', {name: 'Previous page', exact: true}).click();
    await expect(byte(0, 4095)).toHaveClass(/changed/);
    await page.screenshot({path: path.join(os.tmpdir(), 'further-binary-alignment.png')});
    // A bounded alignment fallback must describe the comparison actually displayed.
    await open('large-left.bin', 'large-right.bin');
    await expect(mode).toHaveValue('aligned');
    await expect(note).toContainText('Offset comparison');
    await expect(note).toContainText('size limit');
    await expect(note).toContainText('150,000 differing byte');
    await expect(panes.locator('.binary-gap')).toHaveCount(0);
    await page.getByRole('button', {name: 'Next page', exact: true}).click();
    for (const [side, value] of [[0, '01'], [1, '02']]) {
      await expect(byte(side, 4096)).toHaveText(value);
      await expect(byte(side, 8191)).toHaveText(value);
      await expect(byte(side, 4096)).toHaveClass(/changed/);
      await expect(byte(side, 4096)).toHaveAttribute('title', /0x00001000/);
      await expect(byte(side, 4095)).toHaveCount(0);
    }
    await mode.selectOption('offset');
    await expect(note).toContainText('Offset comparison');
    await expect(note).not.toContainText('size limit');
    await expect(note).toContainText('150,000 differing byte');
    // Difference navigation stays within the viewer and targets every range, even on the same page.
    await open('navigation-left.bin', 'navigation-right.bin');
    await expect(mode).toHaveValue('offset');
    const nextDifference = page.getByRole('button', {name: 'Next difference', exact: true});
    const previousDifference = page.getByRole('button', {name: 'Previous difference', exact: true});
    const differencePosition = page.locator('.binary-difference-position');
    const navigate = async (button, offset, index) => {
      await button.click();
      await expect(differencePosition).toHaveText(`Difference ${index} / 3`);
      await expect(button).toBeFocused();
      await expect(panes.locator('.binary-current')).toHaveCount(2);
      for (const side of [0, 1]) {
        await expect(byte(side, offset)).toHaveClass(/binary-current/);
        await expect(byte(side, offset)).toHaveAttribute('data-position', String(offset));
      }
      await expect.poll(() => page.evaluate(() => {
        const viewport = document.querySelector('.binary-panes').getBoundingClientRect();
        const target = document.querySelector('.binary-current').getBoundingClientRect();
        const button = [...document.querySelectorAll('button')].find(item => item.textContent === 'Next difference').getBoundingClientRect();
        return target.top >= viewport.top && target.bottom <= viewport.bottom && button.top >= 0 && button.bottom <= innerHeight;
      })).toBe(true);
    };
    await navigate(nextDifference, 100, 1);
    await navigate(nextDifference, 3000, 2);
    await navigate(nextDifference, 5000, 3);
    await navigate(nextDifference, 100, 1);
    await navigate(previousDifference, 5000, 3);
    await page.getByRole('button', {name: 'Previous page', exact: true}).click();
    await expect(panes.locator('.binary-current')).toHaveCount(0);
    await expect(differencePosition).toHaveText('Difference — / 3');
    await open('right.bin', 'right.bin');
    await expect(differencePosition).toHaveText('No differences');
    await expect(nextDifference).toBeDisabled();
    await expect(previousDifference).toBeDisabled();
    assert.deepEqual(errors, []);
    console.log('Binary alignment desktop passed: insertion gaps, unchanged suffixes, actual-offset edit/save/undo, offset mode and session persistence, empty inputs, page-boundary offsets, explicit size-limit fallback, and precise difference navigation with focus and viewport checks.');
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => window.__fcAllowClose = true);
    if (app) await app.close();
    await fs.rm(dir, {recursive: true, force: true});
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
