'use strict';
// Opt-in compatibility investigation, not a production reader or encryption writer.
// Requires Info-ZIP and Python's independent zipfile decoder. Fixture password is public.
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process'),{build}=require('esbuild');
(async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'fc-zipcrypto-spike-'));
 try{
  const payload=Buffer.from('Independent legacy encrypted ZIP fixture. Ω\n'.repeat(8192));
  await fs.writeFile(path.join(directory,'text.txt'),payload);
  const compiled=await build({stdin:{contents:"export * from '@zip.js/zip.js/lib/zip-native.js';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'cjs',write:false});
  const module={exports:{}};new Function('require','module','exports',compiled.outputFiles[0].text)(require,module,module.exports);const zip=module.exports;
  let beforeFailure=0;
  async function read(bytes,password,{limit=64*1024*1024}={}){
   const reader=new zip.ZipReader(new zip.Uint8ArrayReader(bytes),{useWebWorkers:false,checkCrc32:true,checkAuthenticationCode:true,strictness:'strict',checkOverlappingEntry:true});
   const chunks=[];let length=0;
   try{
    const entries=await reader.getEntries();assert.equal(entries.length,1);assert.equal(entries[0].encrypted,true);assert.equal(entries[0].filename,'text.txt');
    await entries[0].getData(new WritableStream({write(chunk){length+=chunk.length;if(length>limit)throw Error('OUTPUT_LIMIT');chunks.push(chunk.slice());}}),{password,checkCrc32:true,useWebWorkers:false});
    assert.equal(length,payload.length);return Buffer.concat(chunks);
   }catch(error){beforeFailure+=length;throw error;}finally{for(const chunk of chunks)chunk.fill(0);await reader.close();}
  }
  const results=[];
  for(const method of [0,9]){
   const name='legacy-'+method+'.zip';
   execFileSync('/usr/bin/zip',['-q','-'+method,'-P','fixture-public-password',name,'text.txt'],{cwd:directory});
   execFileSync('python3',['-c','import zipfile,sys,pathlib; z=zipfile.ZipFile(sys.argv[1]); assert z.read("text.txt",pwd=b"fixture-public-password")==pathlib.Path(sys.argv[2]).read_bytes()',path.join(directory,name),path.join(directory,'text.txt')]);
   const bytes=await fs.readFile(path.join(directory,name)),original=Buffer.from(bytes);
   assert.deepEqual(await read(bytes,'fixture-public-password'),payload);
   await assert.rejects(read(bytes,'incorrect-password'));
   await assert.rejects(read(bytes,'fixture-public-password',{limit:1024}),/OUTPUT_LIMIT/);
   const corrupt=Buffer.from(bytes),start=30+corrupt.readUInt16LE(26)+corrupt.readUInt16LE(28);
   corrupt[start+corrupt.readUInt32LE(18)-1]^=1;
   await assert.rejects(read(corrupt,'fixture-public-password'));
   await assert.rejects(read(bytes.subarray(0,bytes.length-4),'fixture-public-password'));
   assert.deepEqual(bytes,original);assert.deepEqual(await read(bytes,'fixture-public-password'),payload);
   results.push({method:bytes.readUInt16LE(8),flags:bytes.readUInt16LE(6),archiveBytes:bytes.length,contentBytes:payload.length});
  }
  console.log(JSON.stringify({passed:true,producer:'Info-ZIP',independentDecoder:'Python zipfile',engine:require('@zip.js/zip.js/package.json').version,results,bytesEmittedBeforeRejectedRead:beforeFailure,note:'CRC is error detection, not cryptographic authentication. Keep plaintext quarantined until successful completion; production remains AES-only.'},null,2));
 }finally{await fs.rm(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
