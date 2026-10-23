const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:700}});
  await page.setContent('<style>*{box-sizing:border-box}.editor-card{height:500px;width:450px;display:flex;flex-direction:column;background:white}.editor-card textarea{width:100%;font:13px/22px monospace;resize:none;border:0;tab-size:4;white-space:pre}</style><div class="editor-card"><textarea id="a" wrap="off"></textarea></div><textarea id="b" hidden></textarea>');
  await page.addStyleTag({content:await fs.readFile('public/live-text-diff.css','utf8')});
  const bundle=await require('esbuild').build({entryPoints:['src/live-text-diff.js'],bundle:true,write:false,format:'iife',globalName:'LiveSurface'});await page.addScriptTag({content:bundle.outputFiles[0].text+';window.createLiveTextDiff=LiveSurface.createLiveTextDiff;'});
  await page.evaluate(()=>{const a=document.querySelector('#a'),b=document.querySelector('#b');window.events=[];a.value=Array.from({length:10000},(_,i)=>i===2?'long '.repeat(120):'line '+i).join('\n');b.value=a.value;window.surface=createLiveTextDiff({areas:{a,b},onHunk:h=>events.push(h),onLinePick:(s,i)=>events.push([s,i])});surface.update({rows:[{ai:2,bi:2,type:'changed',hunk:0,a:'long '.repeat(120),b:'short '+ 'long '.repeat(119)}],hunks:[{aStart:2,bStart:2,aCount:1,bCount:1}]},{selectedHunk:0});});
  await expect(page.locator('.live-text-number.current')).toHaveText('3');await expect(page.locator('.live-text-inline').first()).toBeVisible();
  assert.ok(await page.locator('.live-text-number').count()<30,'Only viewport line numbers are rendered');
  await page.evaluate(()=>{const a=document.querySelector('#a');a.wrap='soft';a.style.whiteSpace='pre-wrap';a.style.overflowWrap='break-word';});
  await expect.poll(()=>page.locator('.live-text-band.changed').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(22);
  await page.locator('.live-text-number.current').click();assert.deepEqual(await page.evaluate(()=>events.slice(-2)),[0,['a',2]]);
  await page.evaluate(()=>{const a=document.querySelector('#a');a.scrollTop=150000;});
  await expect.poll(()=>page.locator('.live-text-number').first().innerText()).not.toBe('1');
  assert.ok(await page.locator('.live-text-number').count()<30);
  await page.evaluate(()=>surface.revealHunk(0));await expect(page.locator('.live-text-number.current')).toBeVisible();
  assert.equal(await page.locator('#a').getAttribute('wrap'),'soft');
  await page.evaluate(()=>surface.update({rows:[{ai:0,bi:0,a:'line 0',b:'changed',type:'changed',hunk:0},{ai:1,bi:1,a:'line 1',b:'line 1',type:'equal'}],hunks:[{aStart:0,bStart:0,aCount:1,bCount:1}]},{filter:'diff',selectedHunk:0}));
  await page.evaluate(()=>surface.revealHunk(0));await expect(page.locator('.live-text-band.equal.deemphasized').first()).toBeVisible();
  await page.evaluate(()=>{window.insertResult={rows:[{ai:null,bi:0,a:null,b:'insert',type:'added',hunk:0}],hunks:[{aStart:0,bStart:0,aCount:0,bCount:1}]};surface.update(insertResult,{selectedHunk:0});surface.revealHunk(0);});
  await expect.poll(()=>page.locator('#a').evaluate(e=>e.scrollTop)).toBe(0);
  await expect(page.locator('.live-text-band.changed')).toHaveCount(0);
  await page.evaluate(()=>{const b=document.querySelector('#b');b.hidden=false;b.style.font='13px/22px monospace';b.style.padding='8px 10px 8px 52px';b.style.width='450px';b.style.height='500px';b.style.flex='none';b.wrap='off';b.style.whiteSpace='pre';document.querySelector('#a').wrap='off';document.querySelector('#a').style.whiteSpace='pre';surface.update({rows:[],hunks:[]});});
  await page.locator('#a').evaluate(e=>{e.scrollTop=700;e.scrollLeft=80;});
  await expect.poll(()=>page.locator('#b').evaluate(e=>e.scrollTop)).toBe(700);
  assert.equal(await page.locator('#b').evaluate(e=>e.scrollLeft),0);
  await page.locator('#b').evaluate(e=>e.scrollTop=400);await expect.poll(()=>page.locator('#a').evaluate(e=>e.scrollTop)).toBe(400);
  console.log('Live surface passed: real wrapped line geometry, virtualized 10,000-line scroll, gutter selection and hunk reveal preserve wrap.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
