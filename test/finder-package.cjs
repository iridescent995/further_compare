'use strict';
// Packaging-only check: never registers or activates extensions.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const hook=require('../scripts/package-finder-extension.cjs');
const root=path.resolve(__dirname,'..');
const run=(exe,args)=>execFileSync(exe,args,{encoding:'utf8'}).trim();
const hash=async file=>crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
(async()=>{
 await hook({electronPlatformName:'win32'}); // Must not read Mac state or run Mac tools.
 if(process.platform!=='darwin'){console.log('Windows hook no-op passed; Mac packaging check requires macOS.');return;}
 const pkg=require('../package.json');
 const source=process.env.FC_TEST_PACKAGE_SOURCE||path.join(root,'release/mac-arm64/Further Compare.app');
 const sourceExe=path.join(source,'Contents/MacOS/Further Compare');
 const original=await hash(sourceExe);
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'fc-finder-package-test-'));
 try{
  const app=path.join(temp,'Further Compare.app');
  run('/usr/bin/ditto',[source,app]);
  const crashpad=path.join(app,'Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler');
  run('/usr/bin/codesign',['--remove-signature',crashpad]);
  assert.notEqual(require('node:child_process').spawnSync('/usr/bin/codesign',['--verify',crashpad]).status,0,'Fixture helper must be unsigned');
  const context={electronPlatformName:'darwin',appOutDir:temp,packager:{projectDir:root,config:pkg.build,appInfo:{version:pkg.version,productFilename:'Further Compare'}}};
  await assert.rejects(hook({...context,packager:{...context.packager,config:{...pkg.build,mac:{identity:'unverified identity'}}}}),/ad-hoc local distributions/);
  await hook(context);
  const extension=path.join(app,'Contents/PlugIns/FurtherCompareFinder.appex');
  const info=JSON.parse(run('/usr/bin/plutil',['-convert','json','-o','-',path.join(extension,'Contents/Info.plist')]));
  assert.equal(info.CFBundleShortVersionString,pkg.version);
  assert.equal(info.CFBundleIdentifier,'com.furthercompare.desktop.finder');
  assert.deepEqual(run('/usr/bin/lipo',['-archs',path.join(extension,'Contents/MacOS/FurtherCompareFinder')]).split(/\s+/).sort(),['arm64','x86_64']);
  run('/usr/bin/codesign',['--verify','--deep','--strict',app]);
  const rights=run('/usr/bin/codesign',['-d','--entitlements','-','--xml',extension]);
  assert.match(rights,/<key>com.apple.security.app-sandbox<\/key><true\/>/);
  const identity=run('/usr/bin/plutil',['-extract','CFBundleIdentifier','raw','-o','-',path.join(app,'Contents/Info.plist')]);
  assert.equal(identity,'com.furthercompare.desktop');
  await assert.rejects(hook(context),/existing packaged Finder extension/);
  assert.equal(await hash(sourceExe),original,'Source app was modified');
  console.log('Finder packaging passed: isolated host, universal extension, sandbox entitlement, coherent ad-hoc signatures, exact versions, Windows no-op, overwrite/signing guards.');
 }finally{await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
