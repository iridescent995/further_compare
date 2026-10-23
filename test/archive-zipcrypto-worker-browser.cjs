'use strict';
// Real browser Worker boundary acceptance using independent Python/Info-ZIP fixtures.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {build} = require('esbuild');
const {chromium} = require('@playwright/test');
const legacyFixtures = require('./fixtures/archive-zipcrypto-independent.json');
const mixedFixtures = require('./fixtures/archive-encryption-mixed-independent.json');
const fixtures = {producers:[...new Set([...legacyFixtures.producers,...mixedFixtures.producers])],archives:{...legacyFixtures.archives,...mixedFixtures.archives}};
(async () => {
  for (const fixture of Object.values(fixtures.archives)) {
    assert.equal(createHash('sha256').update(Buffer.from(fixture.data, 'base64')).digest('hex'), fixture.sha256);
  }
  const [worker, client] = await Promise.all([
    build({entryPoints:['src/archive-aes-worker.js'],bundle:true,write:false,format:'iife',platform:'browser'}),
    build({stdin:{contents:"import {openEncryptedArchiveInWorker} from './src/archive-aes-worker-client.js';window.openReader=openEncryptedArchiveInWorker;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'})
  ]);
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const page = await browser.newPage();
    await page.route('https://further.test/**', route => route.fulfill({contentType:route.request().url().endsWith('.js')?'text/javascript':'text/html',body:route.request().url().endsWith('.js')?worker.outputFiles[0].text:'<main></main>'}));
    await page.goto('https://further.test/');
    await page.addScriptTag({content:client.outputFiles[0].text});
    const result = await page.evaluate(async ({archives}) => {
      const ok = (value, message) => { if (!value) throw Error(message); };
      const bytes = base64 => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const hash = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(n => n.toString(16).padStart(2,'0')).join('');
      const reject = async (promise, code) => {
        let error;
        try { await promise; } catch (e) { error = e; }
        ok(error, 'Expected rejection: '+code);
        if (code) ok(error.code === code, 'Expected '+code+', got '+error.code+': '+error.message);
        return error;
      };
      let successfulReads = 0, lateFailures = 0;
      for (const [name, fixture] of Object.entries(archives)) {
        const input = bytes(fixture.data), reader = await openReader(input);
        try {
          ok(reader.readOnly && reader.encrypted, name+' read-only encrypted metadata');
          for (const entry of fixture.entries) {
            const metadata = reader.entries.get(entry.name);
            ok(metadata && metadata.size === bytes(entry.content).length, name+' exact entry size');
            ok(metadata.encrypted === (entry.password !== null), name+' per-entry encryption');
            const encryptionType = entry.encryptionType === undefined ? (entry.password !== null ? 'zipcrypto' : null) : entry.encryptionType;
            ok(metadata.encryptionType === encryptionType, name+' encryption type');
            ok(metadata.authenticated === (encryptionType === 'aes'), name+' must distinguish AES authentication from legacy CRC');
            if (entry.wrongHeaderPassword) {
              let published = false;
              await reject(reader.read(entry.name,{password:entry.wrongHeaderPassword}).then(() => {published=true;}), 'ARCHIVE_PASSWORD_OR_CORRUPTION');
              ok(!published, name+' late password failure published content');
              lateFailures++;
            }
            const output = await reader.read(entry.name, {password:entry.password === null ? undefined : entry.password});
            ok(await hash(output) === entry.contentSha256, name+' exact plaintext hash');
            successfulReads++;
          }
          ok(await hash(input) === fixture.sha256, name+' modified caller archive');
        } finally { reader.dispose(); }
      }
      const fixture = archives['stored.zip'], entry = fixture.entries[0], input = bytes(fixture.data);
      const corrupt = input.slice(), view = new DataView(corrupt.buffer);
      const offset = 30 + view.getUint16(26,true) + view.getUint16(28,true);
      corrupt[offset + view.getUint32(18,true) - 1] ^= 1;
      const damaged = await openReader(corrupt);
      try { await reject(damaged.read(entry.name,{password:entry.password}), 'ARCHIVE_PASSWORD_OR_CORRUPTION'); }
      finally { damaged.dispose(); }
      let promptInfo, releasePrompt, promptStarted;
      const started = new Promise(resolve => {promptStarted=resolve;});
      const waiting = await openReader(input,{onPassword:info => {promptInfo=info;promptStarted();return new Promise(resolve => {releasePrompt=resolve;});}});
      const controller = new AbortController();
      const pending = waiting.read(entry.name,{signal:controller.signal});
      // Register rejection observers before abort to detect the promised error without an unhandled rejection.
      const pendingResult = reject(pending, 'ARCHIVE_CANCELLED');
      const queuedResult = reject(waiting.read(entry.name,{password:entry.password}), 'ARCHIVE_CANCELLED');
      await started;
      ok(promptInfo.encryptionType === 'zipcrypto', 'Password prompt must identify legacy encryption');
      controller.abort();
      await Promise.all([pendingResult,queuedResult]);
      releasePrompt(entry.password);
      await reject(waiting.read(entry.name,{password:entry.password}), 'ARCHIVE_CLOSED');
      const recovered = await openReader(input);
      try {
        const aborted = new AbortController(); aborted.abort();
        await reject(recovered.read(entry.name,{password:entry.password,signal:aborted.signal}), 'ARCHIVE_CANCELLED');
        ok(await hash(await recovered.read(entry.name,{password:entry.password})) === entry.contentSha256, 'Retry after cancellation');
      } finally { recovered.dispose(); }
      return {archives:Object.keys(archives).length,successfulReads,lateFailures,realWorkerCancellation:true};
    }, fixtures);
    assert.equal(result.archives,12);
    assert.equal(result.successfulReads,19);
    assert.equal(result.lateFailures,10);
    console.log(JSON.stringify({passed:true,...result,producer:fixtures.producers,notes:'CRC and size verification with quarantined publication; legacy ZIP does not authenticate content. UTF-8 password bytes tested; other producer locale encodings are not claimed.'},null,2));
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
