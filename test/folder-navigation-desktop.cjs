'use strict';
const {clickFolderAction}=require('./folder-context-helper.cjs');
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');

(async()=>{
  const temp=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-navigation-')));
  let app,page;
  try {
    const left=path.join(temp,'left'),right=path.join(temp,'right'),child=path.join(left,'child'),other=path.join(temp,'other');
    for(const dir of [child,right,other])await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(child,'inside.txt'),'child\n');
    await fs.writeFile(path.join(left,'root.txt'),'root\n');
    await fs.writeFile(path.join(other,'other.txt'),'other\n');
    const env={...process.env,FC_USER_DATA_DIR:path.join(temp,'profile')};delete env.ELECTRON_RUN_AS_NODE;
    app=await electron.launch({...process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]},env});
    page=await app.firstWindow();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const queue=roots=>app.evaluate(({dialog},roots)=>{
      global.navigationRoots=roots;
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.navigationRoots.shift()]});
    },roots);
    const at=async(side,root)=>{await expect(page.locator('#path'+side)).toHaveValue(root);await expect(page.locator('#folderHistory'+side)).toBeEnabled();};
    const menu=label=>app.evaluate(({Menu},label)=>{
      const find=menu=>{for(const item of menu.items){if(item.label===label)return item;if(item.submenu){const match=find(item.submenu);if(match)return match;}}};
      const item=find(Menu.getApplicationMenu());if(!item)throw new Error('Missing native menu item: '+label);item.click();
    },label);
    const go=async(side,root)=>{await page.locator('#path'+side).fill(root);await page.locator('#path'+side).press('Enter');await at(side,root);};
    const row=(side,name)=>page.locator('#folderRows'+side+' [data-path="'+name+'"]');
    await queue([left,right]);
    await page.locator('#welcome [data-command="new:folder-compare"]').click();
    await page.locator('#sessionName').fill('Navigation one');
    await page.locator('#openA').click();await at('A',left);
    await page.locator('#openB').click();await at('B',right);
    await expect(page.locator('#pathA')).toBeEditable();
    await expect(page.locator('#folderBackA')).toBeDisabled();
    await go('A',child);await expect(row('A','inside.txt')).toBeVisible();await at('B',right);
    await page.locator('#folderParentA').click();await at('A',left);
    await page.locator('#folderBackA').click();await at('A',child);
    await page.locator('#folderBackA').click();await at('A',left);
    await page.locator('#folderForwardA').click();await at('A',child);
    await page.locator('#folderForwardA').click();await at('A',left);
    await expect(page.locator('#folderForwardA')).toBeDisabled();

    await page.locator('#pathA').fill(path.join(temp,'missing'));
    await page.locator('#pathA').press('Enter');
    await expect(page.locator('#notice')).toContainText(/exist|directory|folder|ENOENT|found/i);
    await at('A',left);await expect(row('A','root.txt')).toBeVisible();
    await expect(page.locator('#folderForwardA')).toBeDisabled();
    await page.locator('#folderParentA').click();
    await expect(page.locator('#notice')).toContainText(/overlap|ancestor|contain|nested|separate/i);
    await at('A',left);await at('B',right);
    await expect(row('A','root.txt')).toBeVisible();
    await queue([other]);await page.locator('#openA').click();await at('A',other);
    await page.locator('#folderBackA').click();await at('A',left);
    await page.locator('#folderForwardA').click();await at('A',other);
    await page.locator('#folderHistoryA').selectOption(child);await at('A',child);
    await expect(row('A','inside.txt')).toBeVisible();await at('B',right);

    // Recent roots are accessible from either pane, including empty space.
    const context=page.locator('#folderContext'),item=label=>context.getByRole('menuitem',{name:label,exact:true});
    const recent=async(pane,side,destination)=>{await expect(page.locator('body')).toHaveAttribute('aria-busy','false');await page.locator('#folderRows'+pane).evaluate(el=>el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:400,clientY:400})));await item('Navigate').click();await item('Recent '+side+' folders').click();await item(destination).click();};
    const tabsBefore=await page.getByRole('tab').count();
    await recent('B','left',other);await at('A',other);await at('B',right);assert.equal(await page.getByRole('tab').count(),tabsBefore);
    await recent('A','left',child);await at('A',child);await at('B',right);
    await recent('A','right',other);await at('B',other);await at('A',child);
    await recent('B','right',right);await at('B',right);await at('A',child);
    await row('A','inside.txt').click({button:'right'});await item('Navigate').click();await item('Recent left folders').click();await expect(item(child)).toBeDisabled();await expect(item(other)).toHaveAttribute('title',other);
    await page.keyboard.press('Escape');await expect(item('Recent left folders')).toBeFocused();await page.keyboard.press('Escape');await expect(item('Navigate')).toBeFocused();await page.keyboard.press('Escape');await expect(row('A','inside.txt')).toBeFocused();
    // The same overlap validation used by the toolbar protects context navigation.
    await recent('A','right',child);await expect(page.locator('#notice')).toContainText(/overlap|ancestor|contain|nested|separate/i);await at('A',child);await at('B',right);

    await page.locator('#pathA').focus();
    await menu('Parent Folder (Focused Side)');await at('A',left);await at('B',right);
    await menu('Back (Focused Side)');await at('A',child);
    await row('A','inside.txt').click({button:'right'});
    await clickFolderAction(page,'Go to parent folder');await at('A',left);
    await page.locator('#folderBackA').click();await at('A',child);
    await page.locator('#swap').click();await at('A',right);await at('B',child);
    await expect(page.locator('#folderBackA')).toBeEnabled();await page.locator('#folderBackA').click();await at('A',other);await at('B',child);await page.locator('#folderForwardA').click();await at('A',right);
    await page.locator('#folderBackB').click();await at('B',other);await at('A',right);
    await page.locator('#folderForwardB').click();await at('B',child);
    await page.locator('#swap').click();await at('A',child);await at('B',right);

    await page.locator('#newTab').click();
    await page.locator('#welcome [data-command="new:folder-compare"]').click();
    await page.locator('#sessionName').fill('Navigation two');
    await queue([other]);await page.locator('#openA').click();await at('A',other);
    await expect(page.locator('#folderBackA')).toBeDisabled();
    await go('A',left);
    await page.getByRole('tab',{name:/Navigation one/}).click();await at('A',child);
    await page.locator('#folderBackA').click();await at('A',other);
    await page.getByRole('tab',{name:/Navigation two/}).click();await at('A',left);
    await page.locator('#folderBackA').click();await at('A',other);
    await page.setViewportSize({width:1024,height:768});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Folder controls must fit a 1024px viewport');
    await page.screenshot({path:'/private/tmp/further-folder-navigation.png'});
    await page.locator('#newTab').click();
    await page.locator('#welcome [data-command="new:text-compare"]').click();
    await expect(page.locator('#pathA')).not.toBeEditable();
    await expect(page.locator('#pathB')).not.toBeEditable();
    for(const side of ['A','B'])for(const control of ['Back','Forward','Parent','History'])await expect(page.locator('#folder'+control+side)).toBeHidden();
    assert.deepEqual(errors,[]);
    console.log('Folder navigation desktop passed: typed roots, parent/back/forward, native menus and context navigation, invalid path preservation, picker and recent history, swapped and isolated tab stacks, text-mode controls and 1024px layout.');
  } finally {
    if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});
    if(app)await app.close();
    await fs.rm(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
