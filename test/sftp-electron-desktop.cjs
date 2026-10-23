'use strict';
const {_electron:electron}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
(async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'fc-sftp-electron-'));let fixture,app;
 try{
  fixture=await createSftpServer();
  const env={...process.env,FC_USER_DATA_DIR:path.join(base,'profile')};delete env.ELECTRON_RUN_AS_NODE;
  app=await electron.launch({...(process.env.FC_TEST_EXECUTABLE?{executablePath:process.env.FC_TEST_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env});
  const result=await app.evaluate(async({app},endpoint)=>{
   const require=process.getBuiltinModule('module').createRequire(app.getAppPath()+'/package.json');
   const {connectSftp,probeSftpHostKey}=require('./desktop/sftp-connection.cjs');
   const observed=await probeSftpHostKey({...endpoint,connectTimeoutMs:10000});
   const connection=await connectSftp({...endpoint,username:'fixture-user',password:'fixture-secret',expectedFingerprint:observed,connectTimeoutMs:10000});
   try{return {fingerprint:connection.fingerprint,path:(await connection.request('realpath',['.']))[0],size:(await connection.request('stat',['/fixture/file']))[0].size};}
   finally{await connection.close();}
  },{host:fixture.host,port:fixture.port});
  assert.deepEqual(result,{fingerprint:fixture.fingerprint,path:'/fixture',size:7});
  console.log('Electron SFTP handshake, pin, real requests and cleanup passed.');
 }finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  if(fixture)await fixture.close();
  await fs.rm(base,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
