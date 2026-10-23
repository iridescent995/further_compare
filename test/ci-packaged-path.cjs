'use strict';
// Print a validated GITHUB_ENV assignment for the native matrix runner's app.
const path = require('node:path');
const fs = require('node:fs');
function packagedExecutable(root, platform, arch) {
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) {
    return path.join(root, 'release', arch === 'arm64' ? 'mac-arm64' : 'mac', 'Further Compare.app', 'Contents', 'MacOS', 'Further Compare');
  }
  if (platform === 'win32' && arch === 'x64') {
    return path.join(root, 'release', 'win-unpacked', 'Further Compare.exe');
  }
  throw new Error(`Unsupported safety runner: ${platform}/${arch}`);
}
if (require.main === module) {
  const executable = packagedExecutable(process.cwd(), process.platform, process.arch);
  if (!fs.statSync(executable).isFile()) throw new Error(`Packaged executable missing: ${executable}`);
  if (/[\r\n]/.test(executable)) throw new Error('Invalid executable path');
  console.log(`FC_TEST_EXECUTABLE=${executable}`);
}
module.exports = { packagedExecutable };
