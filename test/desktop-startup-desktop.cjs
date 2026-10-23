'use strict';
const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fc-startup-audit-'));
 try{for(let run=0;run<3;run++){
  let app,page,stderr='';
  try{
   const env={...process.env,FC_USER_DATA_DIR:path.join(root,'profile-'+run)};delete env.ELECTRON_RUN_AS_NODE;delete env.FC_SMOKE;
   app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
   app.process().stderr?.on('data',chunk=>stderr=(stderr+chunk.toString()).slice(-8192));
   page=await app.firstWindow();page.setDefaultTimeout(20000);
   await expect(page.locator('body')).toHaveAttribute('aria-busy','false');
   await expect(page.locator('#welcome')).toBeVisible();await expect(page.getByRole('tab')).toHaveCount(0);
   assert.equal(await page.evaluate(()=>typeof window.desktop.createSession),'function');
   await page.locator('#welcome [data-command="new:folder-compare"]').click();await expect(page.locator('#sessionKind')).toHaveText('Folder Compare');await expect(page.getByRole('tab')).toHaveCount(1);
   console.log('Clean desktop startup passed:',run+1);
  }catch(error){
   console.error('Startup stderr:',stderr);
   if(page&&!page.isClosed()){
    console.error('Startup state:',await page.evaluate(()=>({url:location.href,ready:document.readyState,desktop:typeof window.desktop,bodyClass:document.body.className,inert:document.body.inert,welcomeHidden:document.getElementById('welcome')?.hidden,tabs:document.querySelector('[role=tablist]')?.textContent,notice:document.getElementById('notice')?.textContent})));
    await page.screenshot({path:'/private/tmp/further-desktop-startup-failure.png'});
   }
   throw error;
  }finally{if(page&&!page.isClosed())await page.evaluate(()=>window.__fcAllowClose=true).catch(()=>{});if(app)await app.close();}
 }}finally{await fs.rm(root,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
