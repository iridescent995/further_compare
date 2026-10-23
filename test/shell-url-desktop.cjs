'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const wire=(command,files)=>'furthercompare://shell/v1?payload='+Buffer.from(JSON.stringify({command,files})).toString('base64url');
(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-shell-url-')));
  const repo=path.resolve(__dirname,'..'),executable=process.env.FC_TEST_EXECUTABLE||require('electron');
  const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  let app,page;const errors=[];
  const tabs=()=>page.locator('#sessionTabs [role="tab"]');
  const active=()=>page.locator('#sessionTabs .session-tab.active').getAttribute('data-session-id');
  const ready=()=>expect(page.locator('body')).toHaveAttribute('aria-busy','false');
  const at=async(a,b)=>{await expect(page.locator('#pathA')).toHaveValue(a);await expect(page.locator('#pathB')).toHaveValue(b);await ready();};
  const reviews=()=>app.evaluate(()=>global.urlTestReviews);
  const emit=async(url,replies)=>{
    const prevented=await app.evaluate(({app},{url,replies})=>{
      global.urlTestResponses=[...replies];let prevented=false;
      app.emit('open-url',{preventDefault(){prevented=true;}},url);
      return prevented;
    },{url,replies});assert.equal(prevented,true,'Native open-url must prevent default');
  };
  const settled=async count=>{
    await expect.poll(async()=>(await reviews()).length).toBe(count);
    await expect.poll(()=>page.evaluate(()=>window.desktop.hasPendingShellRequest())).toBe(false);
    await ready();
  };
  try {
    const left=path.join(temp,'left α 😀 & $ `literal` # %.txt'),right=path.join(temp,'right β + ? (copy).txt');
    const unapproved=path.join(temp,'unapproved\n\t\u202Efile.txt');
    await fs.writeFile(left,'left original\n');await fs.writeFile(right,'right original\n');await fs.writeFile(unapproved,'never read this\n');
    // Retain the established argv entry point as a regression check and seed a
    // dirty tab whose identity and native remembered-left state must survive.
    app=await electron.launch({executablePath:executable,args:[...(process.env.FC_TEST_EXECUTABLE?[]:[repo]),'--fc-set-left',left],env});
    page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    await expect(page.locator('#textA')).toHaveValue('left original\n');await ready();
    await page.locator('#sessionName').fill('Preserve URL cancellation draft');await page.locator('#textA').fill('unsaved draft\n');await ready();
    const dirtyId=await active(),initialTabs=await tabs().count();
    const before=await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json'));
    await app.evaluate(({dialog},unapproved)=>{
      global.urlTestReviews=[];global.urlTestResponses=[];global.urlTestAccesses=[];
      dialog.showMessageBox=async(...args)=>{
        const options=args.at(-1);global.urlTestReviews.push(options);
        if(!['Allow file comparison request?','Compare selected items'].includes(options.message))throw Error('Unexpected native dialog: '+options.message);
        if(!global.urlTestResponses.length)throw Error('Missing scripted native response');
        return {response:global.urlTestResponses.shift()};
      };
      const nativeFS=process.getBuiltinModule('fs/promises');
      for(const name of ['realpath','lstat','stat','open','readFile','writeFile','rename','rm']){
        const original=nativeFS[name];nativeFS[name]=function(...args){if(args[0]===unapproved||args[1]===unapproved)global.urlTestAccesses.push(name);return original.apply(this,args);};
      }
    },unapproved);
    assert.deepEqual(await page.evaluate(()=>Object.keys(window.desktop).filter(name=>/url/i.test(name))),[],'Renderer must not gain URL dispatch authority');
    await emit(wire('--fc-set-left',[unapproved]),[0]);await settled(1);
    assert.deepEqual(await app.evaluate(()=>global.urlTestAccesses),[],'Cancelled URL must not access its file');
    assert.equal(await active(),dirtyId);await expect(tabs()).toHaveCount(initialTabs);await expect(page.locator('#textA')).toHaveValue('unsaved draft\n');
    assert.deepEqual(await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json')),before);
    const cancelledReview=(await reviews())[0];assert.deepEqual(cancelledReview.buttons,['Cancel','Continue']);assert.equal(cancelledReview.defaultId,0);assert.equal(cancelledReview.cancelId,0);
    assert.match(cancelledReview.detail,/\\n\\t/);assert.ok(!cancelledReview.detail.includes('\u202E'),'Review must escape bidi formatting');assert.match(cancelledReview.detail,/\\u\{202e\}/i);
    await emit(wire('--fc-set-left',[right]),[1]);await settled(2);await at(right,'');await expect(page.locator('#textA')).toHaveValue('right original\n');
    assert.equal((await page.evaluate(()=>window.desktop.shellState())).left.path,right);
    await emit(wire('--fc-compare-left',[left]),[1]);await settled(3);await at(right,left);await expect(page.locator('#textA')).toHaveValue('right original\n');await expect(page.locator('#textB')).toHaveValue('left original\n');
    const compareReview=(await reviews())[2];assert.ok(compareReview.detail.includes(JSON.stringify(left)));assert.match(compareReview.detail,/Compare with Left/);
    await emit(wire('--fc-compare-selected',[left,right]),[1,2]);await settled(5);await at(right,left);
    const pairReview=(await reviews())[4];assert.equal(pairReview.message,'Compare selected items');assert.deepEqual(pairReview.buttons,['Cancel','Compare','Swap and Compare']);
    assert.equal((await page.evaluate(()=>window.desktop.shellState())).left.path,right,'Selected pair must preserve remembered left');
    const beforePairCancel=await tabs().count(),activeBeforeCancel=await active();
    await emit(wire('--fc-compare-selected',[left,right]),[1,0]);await settled(7);await expect(tabs()).toHaveCount(beforePairCancel);assert.equal(await active(),activeBeforeCancel);
    // Invalid URLs must be consumed as errors without native approval, file
    // loading or tab adoption. Exercise the actual Electron event handler.
    for(const invalid of [wire('--fc-set-left',[left])+'&payload=again','furthercompare://shell/v1?payload=_w',wire('--fc-clear-left',[])]){
      await emit(invalid,[]);await expect(page.locator('#notice')).toContainText('Invalid Further Compare shell URL');
      await expect.poll(()=>page.evaluate(()=>window.desktop.hasPendingShellRequest())).toBe(false);await ready();
      assert.equal((await reviews()).length,7);await expect(tabs()).toHaveCount(beforePairCancel);assert.equal(await active(),activeBeforeCancel);
    }
    const folders=[path.join(temp,'Folder α & $ left'),path.join(temp,'Folder β # right')];
    for(const [index,folder]of folders.entries()){
      await fs.mkdir(folder);await fs.writeFile(path.join(folder,'item.txt'),`folder ${index} content\n`);
      await fs.writeFile(path.join(folder,'same.txt'),'same bytes\n');
    }
    const folderAt=async(a,b)=>{await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await at(a,b);};
    await emit(wire('--fc-set-left',[folders[0]]),[1]);await settled(8);await folderAt(folders[0],'');
    assert.equal((await page.evaluate(()=>window.desktop.shellState())).left.kind,'folder');
    const folderState=await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json'));
    await emit(wire('--fc-compare-left',[folders[1]]),[1]);await settled(9);await folderAt(...folders);
    await expect(page.locator('#folderRowsA [data-path="item.txt"]')).toHaveClass(/changed/);
    await expect(page.locator('#folderRowsA [data-path="same.txt"]')).toHaveClass(/equal/);
    await emit(wire('--fc-compare-selected',folders),[1,2]);await settled(11);await folderAt(folders[1],folders[0]);
    assert.match((await reviews())[10].detail,/folders/);
    assert.deepEqual(await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json')),folderState,'Selected folder pair must preserve remembered left');
    const folderTab=await active(),folderTabs=await tabs().count(),navigation=await page.evaluate(()=>window.desktop.folderNavigation());
    await emit(wire('--fc-compare-selected',folders),[1,0]);await settled(13);
    assert.equal(await active(),folderTab);await expect(tabs()).toHaveCount(folderTabs);
    assert.deepEqual(await page.evaluate(()=>window.desktop.folderNavigation()),navigation,'Cancelling selected folders must preserve native folder authority');
    await folderAt(folders[1],folders[0]);assert.deepEqual(await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json')),folderState);
    // The first review can also reject a folder action before pair review.
    await emit(wire('--fc-set-left',[folders[1]]),[0]);await settled(14);
    assert.equal(await active(),folderTab);await expect(tabs()).toHaveCount(folderTabs);
    assert.deepEqual(await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json')),folderState);
    for(const [index,folder]of folders.entries()){
      assert.equal(await fs.readFile(path.join(folder,'item.txt'),'utf8'),`folder ${index} content\n`);
      assert.equal(await fs.readFile(path.join(folder,'same.txt'),'utf8'),'same bytes\n');
    }
    await page.locator('#sessionTabs [data-session-id="'+dirtyId+'"] [role="tab"]').click();await expect(page.locator('#textA')).toHaveValue('unsaved draft\n');
    const beforeWrongKindTabs=await tabs().count();
    await emit(wire('--fc-compare-left',[left]),[1]);await settled(15);
    await expect(page.locator('#notice')).toContainText('A file cannot be compared with a folder');
    assert.equal(await active(),dirtyId);await expect(tabs()).toHaveCount(beforeWrongKindTabs);await expect(page.locator('#textA')).toHaveValue('unsaved draft\n');
    assert.deepEqual(await fs.readFile(path.join(env.FC_USER_DATA_DIR,'shell-left.json')),folderState,'Wrong-kind failure must preserve remembered left folder');
    assert.equal(await fs.readFile(left,'utf8'),'left original\n');assert.equal(await fs.readFile(right,'utf8'),'right original\n');assert.equal(await fs.readFile(unapproved,'utf8'),'never read this\n');
    assert.deepEqual(errors,[]);
    console.log('Shell URL desktop passed: real open-url event prevention, fail-closed native review before file access, escaped control/bidi paths, approved file/folder set-left/compare-left, selected file/folder pair swap/cancel, folder comparison rows and native authority preservation, malformed URL errors, literal Unicode/metacharacter paths, dirty draft/state preservation, unchanged argv startup.');
  } catch(error){console.error('Shell URL diagnostics:',await page?.locator('#notice').textContent().catch(()=>''),await app?.evaluate(()=>global.urlTestReviews).catch(()=>[]));throw error;}
  finally {if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
