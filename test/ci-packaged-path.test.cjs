'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {packagedExecutable} = require('./ci-packaged-path.cjs');
test('CI selects the native packaged application on all supported runners', () => {
  const root = path.resolve('fixture with spaces');
  for (const [platform, arch, relative] of [
    ['darwin', 'arm64', ['release', 'mac-arm64', 'Further Compare.app', 'Contents', 'MacOS', 'Further Compare']],
    ['darwin', 'x64', ['release', 'mac', 'Further Compare.app', 'Contents', 'MacOS', 'Further Compare']],
    ['win32', 'x64', ['release', 'win-unpacked', 'Further Compare.exe']],
  ]) assert.equal(packagedExecutable(root, platform, arch), path.join(root, ...relative));
  assert.throws(() => packagedExecutable(root, 'linux', 'x64'), /Unsupported/);
  assert.throws(() => packagedExecutable(root, 'win32', 'arm64'), /Unsupported/);
});
