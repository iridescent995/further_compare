'use strict';
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://sftp-known.test/**',async route=>route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?await fs.readFile('src/sftp-connection-dialog.js','utf8'):'<!doctype html><html><body></body></html>'}));
 await page.goto('http://sftp-known.test/');await page.evaluate(async()=>{
  const {createSftpConnectionDialog}=await import('/dialog.js');window.calls=[];window.saved=null;window.key='SHA256:'+'A'.repeat(43);window.failAuth=false;
  window.ui=createSftpConnectionDialog({isCurrent:()=>true,desktop:{
   probeSftp:async()=>({attemptId:'attempt'}),reviewSftp:async()=>({attemptId:'attempt',host:'fixture.test',port:22,fingerprint:key,approvalToken:'review-token',expiresAt:Date.now()+60000,rememberSupported:true,savedFingerprint:saved,knownHost:saved===key,keyChanged:!!saved&&saved!==key,previousFingerprint:saved}),
   connectSftp:async(id,request)=>{calls.push(structuredClone(request));if(failAuth)throw Error('Authentication failed.');return {connectionId:'connection'};},
   prepareSftpAttachment:async()=>({attachmentId:'attachment',descriptor:{path:'sftp:fixture',name:'fixture'}}),commitSftpAttachment:async()=>({path:'sftp:fixture',name:'fixture'}),cancelSftp:async()=>{},disconnectSftp:async()=>{},forgetSftpHost:async(id,request)=>{calls.push({forget:structuredClone(request)});saved=null;return true;}
  }});
 });
 const dialog=page.locator('#sftpConnectionDialog'),remember=dialog.locator('[name=rememberHost]'),consent=dialog.getByRole('checkbox',{name:'I recognize this server key'}),connect=dialog.getByRole('button',{name:'Approve and connect',exact:true});
 const open=async()=>{await page.evaluate(()=>{void ui.open({sessionId:'session',side:'a'});});for(const [name,value]of Object.entries({host:'fixture.test',username:'user',password:'secret'}))await dialog.locator('[name='+name+']').fill(value);await dialog.getByRole('button',{name:'Review server key',exact:true}).click();await expect(remember).toBeVisible();await expect(remember).not.toBeChecked();await expect(consent).not.toBeChecked();await expect(connect).toBeDisabled();};
 await open();await remember.check();await expect(connect).toBeDisabled();await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(await page.evaluate(()=>calls),[]);
 await open();await consent.check();await connect.click();await expect(dialog).not.toBeVisible();assert.equal(await page.evaluate(()=>Object.hasOwn(calls.at(-1),'rememberHost')),false);
 await open();await remember.check();await consent.check();await connect.click();await expect(dialog).not.toBeVisible();assert.equal(await page.evaluate(()=>calls.at(-1).rememberHost),true);
 await page.evaluate(()=>{saved=key;});await open();await expect(dialog.locator('#sftpRememberedKey')).toContainText('matches the saved key');await expect(connect).toBeDisabled();await page.keyboard.press('Escape');
 await page.evaluate(()=>{saved='SHA256:'+'B'.repeat(43);});await open();await expect(dialog).toContainText('The key has changed. Previous key: SHA256:'+'B'.repeat(43));await expect(remember.locator('..')).toContainText('Replace the saved key');await page.keyboard.press('Escape');
 await page.evaluate(()=>{failAuth=true;});await open();await remember.check();await consent.check();await connect.click();await expect(dialog.getByRole('alert')).toContainText('Authentication failed');await expect(dialog.locator('[name=password]')).toHaveValue('');await page.keyboard.press('Escape');await page.evaluate(()=>{failAuth=false;});await open();await expect(remember).not.toBeChecked();await page.keyboard.press('Escape');
 await page.evaluate(()=>{saved=key;});await open();await dialog.locator('#sftpForgetHost').click();await expect(dialog.getByRole('button',{name:'Review server key',exact:true})).toBeVisible();assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{forget:{attemptId:'attempt',approvalToken:'review-token'}});await dialog.getByRole('button',{name:'Review server key',exact:true}).click();await expect(dialog.locator('#sftpRememberedKey')).toContainText('No saved key');await expect(dialog.locator('#sftpForgetHost')).not.toBeVisible();await expect(consent).not.toBeChecked();await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('SFTP remembered host dialog passed: independent consent, default-off persistence, exact request flag, recognition and changed-key disclosure, failed-auth cleanup, reopen reset, and forgetting that requires renewed review.');
 }finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
