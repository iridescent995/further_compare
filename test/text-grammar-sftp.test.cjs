'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createSftpServer}=require('./sftp-server-fixture.cjs');
const {connectSftp}=require('../desktop/sftp-connection.cjs');
const {SftpFolderProvider}=require('../desktop/sftp-folder-provider.cjs');
const {ProviderFolderService,localFolderEndpoint}=require('../desktop/provider-folder-service.cjs');
const {FolderService}=require('../desktop/folders.cjs');
test('custom grammar agrees across real SFTP and local endpoints',{timeout:15000},async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'fc-grammar-sftp-'))),connections=[];let server;
 t.after(async()=>{for(const connection of connections)await connection.close();if(server)await server.close();await fs.rm(root,{recursive:true,force:true});});
 for(const side of ['a','b']){await fs.mkdir(path.join(root,side));await fs.writeFile(path.join(root,side,'A.ddl'),side==='a'?'# comment\nselect 1;\n':'select 1;\n');}
 server=await createSftpServer({root,readChunk:3});const endpoints={};
 for(const side of ['a','b']){const connection=await connectSftp({host:server.host,port:server.port,username:'fixture-user',password:'fixture-secret',expectedFingerprint:server.fingerprint});connections.push(connection);endpoints[side]=await SftpFolderProvider.create(connection,'/'+side);}
 const local=new FolderService(path.join(root,'backups'));await local.select('a',path.join(root,'a'));const pair=[{a:'A.ddl',b:'A.ddl'}],rules={mode:'text-content',textGrammar:{version:1,importance:{},elements:[{name:'Metadata',kind:'line',importance:'unimportant',start:'#'}]}};
 for(const service of [new ProviderFolderService(endpoints),new ProviderFolderService({a:localFolderEndpoint(local,'a'),b:endpoints.b})]){
  assert.equal((await service.compareFilePairs(pair,rules)).rows[0].status,'equal');assert.equal((await service.compareFilePairs(pair,{...rules,textGrammar:{version:1,importance:{},elements:[]}})).rows[0].status,'changed');assert.equal((await service.compareFilePairs(pair,{...rules,mode:'content'})).rows[0].status,'changed');
 }
 assert.equal(await fs.readFile(path.join(root,'a/A.ddl'),'utf8'),'# comment\nselect 1;\n');
});
