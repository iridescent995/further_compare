'use strict';
const {_electron:electron,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:20000});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-live-colors-')));
  let app,page;
  try {
    const left=path.join(temp,'left'),right=path.join(temp,'right');
    for(const root of [left,right]){
      await fs.mkdir(root);
      for(let index=0;index<100;index++){
        const name=`item-${String(index).padStart(3,'0')}.txt`;
        await fs.writeFile(path.join(root,name),index%2===0&&root===right?'BBBB':'AAAA');
        await fs.utimes(path.join(root,name),1700000000,1700000000);
      }
    }
    const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({...process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]},env});
    page=await app.firstWindow();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    // Native menu messages have no Playwright actionability wait. Wait for the
    // renderer to register its listeners before sending the first command.
    await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
    await expect(page.locator('#welcome')).toBeVisible();
    await app.evaluate(({ipcMain})=>{
      const original=ipcMain._invokeHandlers.get('folders:tree-compare');
      global.liveColorsGate={enabled:false,waiting:0,releases:[]};
      ipcMain.removeHandler('folders:tree-compare');
      ipcMain.handle('folders:tree-compare',async(...args)=>{
        const result=await original(...args),gate=global.liveColorsGate;
        if(gate.enabled&&result.rows.some(row=>row.kindA==='file'&&row.kindB==='file')){
          gate.waiting++;
          await new Promise(resolve=>gate.releases.push(resolve));
        }
        return result;
      });
    });
    const row=(name,side='A')=>page.locator(`#folderRows${side} .folder-entry[data-path="${name}"]`);
    const release=()=>app.evaluate(()=>{const gate=global.liveColorsGate;gate.enabled=false;for(const done of gate.releases.splice(0))done();});
    const pending=async filter=>{
      const tabCount=await page.getByRole('tab').count();
      await app.evaluate(({dialog,BrowserWindow},roots)=>{
        global.liveColorsGate.enabled=true;global.liveColorsGate.waiting=0;
        let index=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[roots[index++]]});
        BrowserWindow.getAllWindows()[0].webContents.send('menu-action','new:folder-compare');
      },[left,right]);
      await expect(page.getByRole('tab')).toHaveCount(tabCount+1);
      await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
      await expect(page.locator('#folderWorkspace')).toBeVisible();
      await page.locator('#openA').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
      await page.locator('#openB').click();await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
      await expect(row('item-050.txt')).toHaveClass(/\bunchecked\b/);
      await expect.poll(()=>app.evaluate(()=>global.liveColorsGate.waiting)).toBeGreaterThan(0);
      await page.locator(`[data-filter="${filter}"]`).click();
    };
    await pending('all');
    await row('item-050.txt').click();
    await page.evaluate(()=>{
      window.__liveColorRows=[...document.querySelectorAll('#folderRowsA .folder-entry,#folderRowsB .folder-entry')];
      const pane=document.querySelector('.folder-panes');
      window.__liveColorScroll=pane.scrollTop;
      window.__liveColorFocus=document.activeElement;
    });
    assert.ok(await page.evaluate(()=>window.__liveColorScroll>0),'Fixture must scroll to exercise scroll preservation');
    await release();
    for(const side of ['A','B']){
      await expect(row('item-050.txt',side)).toHaveClass(/\bchanged\b/);
      await expect(row('item-051.txt',side)).toHaveClass(/\bequal\b/);
      await expect(row('item-050.txt',side)).toHaveAttribute('data-comparison','content');
      await expect(row('item-051.txt',side)).toHaveAttribute('aria-label','item-051.txt, equal');
    }
    assert.equal(await page.evaluate(()=>window.__liveColorRows.every(node=>node.isConnected&&node===document.querySelector(`#folderRows${node.dataset.side.toUpperCase()} .folder-entry[data-path="${node.dataset.path}"]`))),true,'Async comparison must retain the actual DOM rows');
    assert.equal(await page.evaluate(()=>document.activeElement===window.__liveColorFocus),true,'Focused DOM node must survive');
    assert.equal(await page.evaluate(()=>document.querySelector('.folder-panes').scrollTop===window.__liveColorScroll),true,'Scroll must survive');
    await expect(row('item-050.txt')).toHaveAttribute('aria-selected','true');
    assert.deepEqual(await page.locator('#folderRowsA .selected').evaluateAll(nodes=>nodes.map(node=>node.dataset.path)),['item-050.txt']);

    // Changing membership requires a render: unchecked entries cannot remain stuck in either filter.
    await pending('diff');
    await release();
    await expect(row('item-050.txt')).toHaveClass(/\bchanged\b/);
    await expect(row('item-051.txt')).toHaveCount(0);
    await expect(page.locator('#folderRowsA .folder-entry')).toHaveCount(50);
    await pending('same');
    await expect(page.locator('#folderRowsA .folder-entry')).toHaveCount(0);
    await release();
    await expect(row('item-051.txt')).toHaveClass(/\bequal\b/);
    await expect(row('item-050.txt')).toHaveCount(0);
    await expect(page.locator('#folderRowsA .folder-entry')).toHaveCount(50);
    assert.deepEqual(errors,[]);
    console.log('Folder live colors passed: actual DOM identity, selection, focus, scroll, content provenance, accessible status and resolving difference/identical filters.');
  } finally {
    if(app)await app.evaluate(()=>{const gate=global.liveColorsGate;if(gate){gate.enabled=false;for(const done of gate.releases.splice(0))done();}}).catch(()=>{});
    if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
    if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
    await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
