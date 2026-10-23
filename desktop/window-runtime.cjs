'use strict';
const localSnapshot=require('./local-file-snapshot.cjs');
const {decodeTextInput,isDocumentInput}=require('../src/text-input.cjs');
const {assertTextExportTarget,assertDocumentTargetSnapshot}=require('./document-save-guard.cjs');
const {assertTableValueTarget,assertOdsCopyTarget,protectedTableSourceKind}=require('./table-value-save-guard.cjs');
const {createLocalTextSaver}=require('./local-text-save.cjs');
const {validateStagedPair}=require('./folder-pair.cjs');
const {validateRemoteFolderDescriptor}=require('./sessions.cjs');
const {createFolderReadRequests,validateFolderReadTicket}=require('./folder-read-requests.cjs');
const {FolderPatch}=require('./folder-patch.cjs');
const {SftpRegistry}=require('./sftp-registry.cjs');
const {SftpKeyFiles}=require('./sftp-key-files.cjs');
const {SftpFolderProvider}=require('./sftp-folder-provider.cjs');
const {ProviderFolderService,localFolderEndpoint}=require('./provider-folder-service.cjs');
const {stageProviderFolderOpen}=require('./provider-folder-open.cjs');
const {readProviderFolderProperties}=require('./provider-folder-properties.cjs');
const {readProviderFolderSize}=require('./provider-folder-size.cjs');
const {prepareSftpRename,executeSftpRename,revokeSftpRename}=require('./sftp-file-rename.cjs');
const {prepareSftpDelete,executeSftpDelete,revokeSftpDelete}=require('./sftp-file-delete.cjs');
const {prepareSftpTextSave,commitSftpTextSave}=require('./sftp-text-save.cjs');
const {prepareRecursiveProviderCopy,executeRecursiveProviderCopy,revokeRecursiveProviderCopy}=require('./provider-recursive-copy.cjs');
const {prepareSftpDirectory,createSftpDirectory,finalizeSftpDirectory}=require('./sftp-transfer-directories.cjs');
const {prepareLocalDirectory,createLocalDirectory,finalizeLocalDirectory}=require('./local-transfer-directories.cjs');
const {transferFileToSftp}=require('./sftp-transfer-writer.cjs');
const {transferFileToLocal}=require('./local-transfer-writer.cjs');
const {validateOperationScope}=require('./folder-operation-scope.cjs');
const {filterEntries}=require('../src/folder-view.cjs');
const {checkSignal}=require('./local-folder-reader.cjs');
const {readArchiveFiles}=require('./archive-import.cjs');
const {readArchiveFolder}=require('./archive-folder-import.cjs');
const {previewFolderAttributes,setFolderAttributes,validateAttributeChanges}=require('./folder-attributes.cjs');
// Source-document protection spans windows without sharing their file capabilities.
const documentSourceReaders=new WeakMap(),tableSourceReaders=new WeakMap();
// Each runtime owns all session capabilities and captures one immutable window.
function createWindowRuntime(mainWindow,shared){
 const {process,app,dialog,shell,clipboard,fs,path,randomUUID,FolderService,readFolderTextReport,dataOpenDialog,validateArchiveExtraction,extractArchiveEntries,BatchService,readFolderProperties,readFolderSize,ThreeWayFolders,ThreeWayRecovery,FolderTree,FolderAlignment,MappedFolderOperations,UpdateBothOperations,previewCopyToFolder,previewMove,previewFilteredMove,previewFilteredDelete,previewFilteredCopyToFolder,stageFolderPair,shellIntegration,validateEditorSettings,normalizeSettingsTransfer,readSettingsTransfer,writeSettingsTransfer,captureSessionDefaults,setFolderModified,execFileAsync,createSnapshot,saveSnapshot,loadSnapshot,compareSnapshots,validateSession,readLimited,stageSession,MAX_TEXT_BYTES,MAX_SESSION_BYTES,TYPES,decodeData,readDataLimited,readTextLimited,encodeText,decodeText,validateFormat,detectLineEnding,validateWorkspace,stageWorkspace,writeWorkspace,setSessionLocked,writeSession,applyTransferredPreferences,entryURL,externalEditor,sessionDefaults,fileActionHistory,folderNavigation,shellRequests,shortcutState,buildApplicationMenu}=shared;
 const saveLocalFile=createLocalTextSaver({fs});
 let disposed=false,running=0,explorerIntegrationService=null,explorerIntegrationOwner=null;
 // Internal publication joins the same native transaction queue as local work.
 const scheduleCommit=shared.scheduleRuntimeCommit||(work=>Promise.resolve().then(work));
 const handlers=new Map(),immediateHandlers=new Map(),folderReads=createFolderReadRequests();
 const pdfLifetime=new AbortController();
 const cancelPdfExtraction=()=>pdfLifetime.abort();
 mainWindow.once('closed',cancelPdfExtraction);
 const extractPdfText=(bytes,options={})=>{
  pdfLifetime.signal.throwIfAborted();
  if(!shared.pdfTextService)throw Error('PDF text extraction is unavailable in this runtime.');
  const signal=options.signal?AbortSignal.any([pdfLifetime.signal,options.signal]):pdfLifetime.signal;
  signal.throwIfAborted();
  return shared.pdfTextService.extract(bytes,{...options,signal});
 };
 const extractDocText=(bytes,options={})=>require('../src/doc-text-node.cjs').extractDocTextInNode(bytes,{...options,signal:options.signal?AbortSignal.any([pdfLifetime.signal,options.signal]):pdfLifetime.signal});
 const createFolderService=backup=>new FolderService(backup,{extractPdfText,extractDocText});
 let textPaths={},sessionPath=null,folders=createFolderService(path.join(app.getPath('userData'),'backups')),pendingPreview=null,executing=false;
 const folderPatchPlans=new Map(),attributePlans=new Map();
 async function dropFolderPatch(id){const plan=folderPatchPlans.get(id);if(plan){folderPatchPlans.delete(id);await plan.service.dispose();}}
 const remoteTextSaveJobs=new Map(),remoteTransfers=new Map(),cancelledTransferRequests=new Map();
 function revokeTransfer(id){const task=remoteTransfers.get(id);if(!task)return;remoteTransfers.delete(id);task.controller.abort();if(task.plan)(task.kind==='rename'?revokeSftpRename:task.kind==='delete'?revokeSftpDelete:revokeRecursiveProviderCopy)(task.plan);if(pendingPreview?.transfer===task)pendingPreview=null;const context=contexts.get(id);if(context?.pendingPreview?.transfer===task)context.pendingPreview=null;}
 function revokeServiceTransfers(service){for(const [id,task]of remoteTransfers)if(task.owner===service)revokeTransfer(id);}
 const contexts=new Map(),remoteRoots=new WeakMap(),pendingRemoteRoots=new WeakMap(),remoteChildOrigins=new Map(),remoteChildJobs=new Map();
 const remoteOpenChannels=new Set(['folders:tree-properties','folders:tree-size','folders:tree-open-files','folders:tree-open-data','folders:tree-open-pair']);
 function cancelRemoteChildren(service){if(folderSizeRequest?.owner===service){folderSizeRequest.controller.abort();folderSizeRequest=null;}for(const controller of remoteChildJobs.get(service)||[])controller.abort();}
 let activationGeneration=0;
 function hasRemote(service=folders){const remote=remoteRoots.get(service);return !!(remote?.a||remote?.b);}
 function remoteDescriptors(service=folders){
  const connected=remoteRoots.get(service),pending=pendingRemoteRoots.get(service),result={a:null,b:null};
  for(const side of ['a','b']){const endpoint=connected?.[side];if(endpoint){const descriptor=endpoint.descriptor;result[side]=validateRemoteFolderDescriptor({protocol:'sftp',host:descriptor.host,port:descriptor.port,username:descriptor.username,root:endpoint.provider.root});}else if(pending?.[side])result[side]={...pending[side]};}
  return result;
 }
 function hasPendingRemote(service=folders){const pending=pendingRemoteRoots.get(service);return !!(pending?.a||pending?.b);}
 function endpointKinds(service){const descriptors=remoteDescriptors(service);return Object.fromEntries(['a','b'].map(side=>[side,descriptors[side]?'remote':'local']));}
 function restoreRemoteDescriptors(service,data){if(data.remoteFolders)pendingRemoteRoots.set(service,{a:data.remoteFolders.a?Object.freeze({...data.remoteFolders.a}):null,b:data.remoteFolders.b?Object.freeze({...data.remoteFolders.b}):null});}
 function nativeSessionData(value,service){
  const input={...value},remoteFolders=remoteDescriptors(service);delete input.remoteFolders;
  input.folders=Object.fromEntries(['a','b'].map(side=>[side,service.roots[side]?{name:path.basename(service.roots[side]),path:service.roots[side]}:null]));
  if(['folder-compare','folder-merge','folder-sync'].includes(input.type)){
   if(remoteFolders.a||remoteFolders.b)input.remoteFolders=remoteFolders;
   input.options={...input.options,folderAlignment:treeFor(service).manualAlignment.pairs,folderNameRules:treeFor(service).nameRules};
  }
  return validateSession(input);
 }
 function treeService(service){
  const remote=remoteRoots.get(service);if(!hasRemote(service))return service;
  const endpoints={};for(const side of ['a','b'])if(remote?.[side])endpoints[side]=remote[side].provider;else if(service.roots[side])endpoints[side]=localFolderEndpoint(service,side);
  return new ProviderFolderService(endpoints);
 }
 function clearRemoteSide(service,side){const pending=pendingRemoteRoots.get(service);if(pending){delete pending[side];if(!hasPendingRemote(service))pendingRemoteRoots.delete(service);}const remote=remoteRoots.get(service);if(remote){delete remote[side];if(!hasRemote(service))remoteRoots.delete(service);}}
 const remoteReadChannels=new Set(['folders:tree-properties','folders:tree-size','folders:tree-copy-paths','folders:matching','folders:tree-list','folders:tree-compare','folders:tree-compare-selected','folders:tree-refresh-selected','folders:tree-name-rules','folders:tree-align','folders:tree-clear-alignment','folders:tree-open-files','folders:tree-open-data','folders:tree-open-pair','folders:choose','folders:navigate','folders:navigation','folders:patch-cancel','folders:tree-attributes-cancel']);
 function assertRemoteAction(channel,args){
  if(hasPendingRemote()&&(channel.startsWith('folders:')&&!['folders:choose','folders:navigate','folders:navigation','folders:patch-cancel','folders:tree-attributes-cancel'].includes(channel)||['session:compare-parents','shell:set-left'].includes(channel)||channel==='editor:open'&&['folder','folder-tree'].includes(args[0]?.source)))throw Error('Reconnect the saved SFTP folders before comparing or changing their contents.');
  if(!hasRemote())return;
  if(channel==='folders:tree-preview-rename')return;
  if(channel==='folders:tree-rename'&&['a','b'].includes(args[0])&&!remoteRoots.get(folders)?.[args[0]]&&folders.roots[args[0]])return;
  if(channel==='folders:tree-preview-action'&&['copy','delete'].includes(args[0])||channel==='folders:execute'&&pendingPreview?.remoteTransfer&&pendingPreview.id===args[0])return;
  if(channel.startsWith('folders:')&&!remoteReadChannels.has(channel)||['session:compare-parents','shell:set-left'].includes(channel)||channel==='editor:open'&&['folder','folder-tree'].includes(args[0]?.source))throw Error('This action is not available for SFTP folder comparisons. Use the reviewed Copy controls to copy files or folders.');
 }

 // Snapshot objects are replaced by rememberContext; native SFTP owners are not.
 const sftpKeys=new SftpKeyFiles(),sftpRegistry=new SftpRegistry({knownHosts:shared.sftpKnownHosts}),sftpSessions=new Map(),sftpBlocked=new Set(),sftpCleanup=new Set();
 function sftpSession(id){
  if(disposed||typeof id!=='string'||!contexts.has(id)||sftpBlocked.has(id))throw Error('This SFTP session is no longer available.');
  let entry=sftpSessions.get(id);if(!entry){entry={owner:{},reviews:new Map(),attachments:new Map()};sftpSessions.set(id,entry);}
  const pending=new Set(sftpRegistry.list(entry.owner).attempts.map(attempt=>attempt.attemptId));
  for(const [attemptId,review] of entry.reviews)if(!pending.has(attemptId)){clearTimeout(review.timer);entry.reviews.delete(attemptId);}
  return entry;
 }
 function revokeSftpSession(id){
  cancelledTransferRequests.delete(id);revokeTransfer(id);sftpBlocked.add(id);remoteTextSaveJobs.get(id)?.abort();remoteChildOrigins.delete(id);const context=id===activeId?{folders}:contexts.get(id);if(context){cancelRemoteChildren(context.folders);remoteRoots.delete(context.folders);pendingRemoteRoots.delete(context.folders);folderTrees.get(context.folders)?.dispose();}const entry=sftpSessions.get(id);sftpSessions.delete(id);
  if(!entry)return Promise.resolve();sftpKeys.dispose(entry.owner);for(const attachment of entry.attachments.values())clearTimeout(attachment.timer);entry.attachments.clear();for(const review of entry.reviews.values())clearTimeout(review.timer);entry.reviews.clear();
  const cleanup=sftpRegistry.disposeSession(entry.owner);sftpCleanup.add(cleanup);cleanup.then(()=>sftpCleanup.delete(cleanup),()=>sftpCleanup.delete(cleanup));return cleanup;
 }
 function sftpHandle(value){if(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value))throw Error('Invalid SFTP handle.');return value;}
 let activeId=null,revisions={},textFormats={},textInputEncodings={},textProjections={},dataAuthorities=new Map();
 let folderSizeRequest=null,filenameScan=null;const cancelledFilenameScans=new Set();
 const batchService=new BatchService({extractPdfText,extractDocText,signal:pdfLifetime.signal}),threeWayRecovery=new ThreeWayRecovery(path.join(app.getPath('userData'),'backups'));
const threeWayFolders = new WeakMap();
function threeWayFor(service = folders) {
  if (!threeWayFolders.has(service)) threeWayFolders.set(service,new ThreeWayFolders(service.backupRoot));
  return threeWayFolders.get(service);
}
const folderTrees = new WeakMap();
function replaceTree(service,tree){revokeServiceTransfers(service);cancelRemoteChildren(service);folderTrees.get(service)?.dispose();folderTrees.set(service,tree);return tree;}

function treeFor(service = folders) {
  if (!folderTrees.has(service)) replaceTree(service,new FolderTree(treeService(service)));
  return folderTrees.get(service);
}
function invalidateTree(service = folders) {
  const tree = folderTrees.get(service);
  if (tree) replaceTree(service,new FolderTree(treeService(service),tree.manualAlignment,tree.nameRules));
}
function treeRevision(token) {
  const tree = treeFor();
  if (token !== tree.revision) throw new Error('Folder tree revision changed. Refresh the selection.');
  return tree;
}
function rowIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 50000 || ids.some(id=>typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) || new Set(ids).size !== ids.length) throw new Error('Choose loaded folder rows.');
  return ids;
}
function rememberContext() {
  if (activeId) contexts.set(activeId, {textPaths, sessionPath, folders, pendingPreview, revisions, textFormats, textInputEncodings, textProjections, dataAuthorities});
}
function checkAlignmentRename(oldPath,newPath) {
  rememberContext();
  for (const context of contexts.values()) {
    let alignment = folderTrees.get(context.folders)?.manualAlignment;
    if (!alignment) continue;
    for (const side of ['a','b']) {
      const root = context.folders.roots[side];
      if (!root) continue;
      const relative = path.relative(root,oldPath);
      if (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) alignment = alignment.rename(side,relative.split(path.sep).join('/'),path.relative(root,newPath).split(path.sep).join('/'));
    }
  }
}
function remapRenamedContexts(oldPath, newPath) {
  rememberContext();
  const remap = value => {
    if (typeof value !== 'string') return value;
    const relative = path.relative(oldPath, value);
    return relative === '' || relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative) ? path.join(newPath, relative) : value;
  };
  const updates = [];
  for (const [id, context] of contexts) {
    const update = {id, files:{}, folders:{}, entries:[]};
    folderNavigation.remap(context.folders, remap);
    for (const side of ['a','b']) {
      const original = context.textPaths[side], moved = remap(original);
      if (original && moved !== original) { context.textPaths[side] = moved; update.files[side] = {name:path.basename(moved),path:moved}; }
      const root = context.folders.roots[side];
      if (root) {
        const relative = path.relative(root, oldPath);
        if (relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) update.entries.push({side,oldPath:relative.split(path.sep).join('/'),newPath:path.relative(root,newPath).split(path.sep).join('/')});
        const movedRoot = remap(root);
        if (movedRoot !== root) { context.folders.roots[side] = movedRoot; update.folders[side] = {name:path.basename(movedRoot),path:movedRoot}; }
      }
    }
    for (const authority of context.dataAuthorities.values()) authority.path = remap(authority.path);
    const oldTree = folderTrees.get(context.folders);
    if (oldTree) {
      let alignment = oldTree.manualAlignment;
      for (const entry of update.entries) alignment = alignment.rename(entry.side,entry.oldPath,entry.newPath);
      replaceTree(context.folders,new FolderTree(treeService(context.folders),alignment,oldTree.nameRules));
    }
    // Every pending plan is tied to filesystem state before this rename.
    context.pendingPreview = null; context.folders.plans.clear(); context.folders.hashCache.clear();
    if (Object.keys(update.files).length || Object.keys(update.folders).length || update.entries.length) updates.push(update);
  }
  pendingPreview = null;
  void folderNavigation.persist();
  return updates;
}
function activateContext(id) {
  if (typeof id !== 'string' || !contexts.has(id)) throw new Error('This session is no longer open.');
  if(activeId!==id){revokeTransfer(activeId);cancelRemoteChildren(folders);}
  rememberContext();
  activeId = id;activationGeneration++;
  ({textPaths, sessionPath, folders, pendingPreview, revisions, textFormats, textInputEncodings, textProjections, dataAuthorities} = contexts.get(id));
  folders.extractPdfText=extractPdfText;folders.extractDocText=extractDocText;
  return {id};
}
function createContext() {
  rememberContext();
  const id = randomUUID();
  contexts.set(id, {textPaths:{}, sessionPath:null, folders:createFolderService(path.join(app.getPath('userData'), 'backups')), pendingPreview:null, revisions:{}, textFormats:{}, textInputEncodings:{}, textProjections:{}, dataAuthorities:new Map()});
  return activateContext(id);
}
async function revision(file) {
  try { const stat = await fs.stat(file); return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`; }
  catch (error) { if (['ENOENT','ENOTDIR'].includes(error.code)) return 'missing'; throw error; }
}
// Stage disk bytes and native authority together; publication must never await.
function openOwner(message='The active comparison changed while opening files. Try again.') {
 const id=activeId,generation=activationGeneration,service=folders;
 return ()=>{if(disposed||activeId!==id||activationGeneration!==generation||folders!==service)throw Error(message);};
}
function pdfReadOptions(value={}) {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['pdfOrder','docxScope','odtScope','docScope'].includes(key))||value.pdfOrder!==undefined&&!['document','page-rows','page-columns','tagged-structure'].includes(value.pdfOrder))throw Error('Invalid PDF reading options.');
 if(value.docxScope!==undefined&&!['main-document','main-and-related-text'].includes(value.docxScope))throw Error('Invalid DOCX reading scope.');
 if(value.odtScope!==undefined&&!['main-document','main-and-related-text'].includes(value.odtScope))throw Error('Invalid ODT reading scope.');
 if(value.docScope!==undefined&&!['main-document','main-and-related-text'].includes(value.docScope))throw Error('Invalid DOC reading scope.');
 return {docScope:value.docScope??'main-document',pdfOrder:value.pdfOrder??'document',docxScope:value.docxScope??'main-document',odtScope:value.odtScope??'main-document'};
}
async function stageText(file,encoding='auto',readOptions={}) {
 const {bytes,snapshot}=await localSnapshot.read(file,isDocumentInput(file)?32*1024*1024:MAX_TEXT_BYTES);
 const decoded=await decodeTextInput(bytes,path.basename(snapshot.path),encoding||'auto',{extractPdfText,extractDocText,...readOptions}),format=validateFormat(decoded.format);
 return {snapshot,value:{name:path.basename(snapshot.path),path:snapshot.path,content:decoded.content,format,...(decoded.documentProjection?{documentProjection:decoded.documentProjection}:{})}};
}
function commitLoaded(side,stage) {
 const {snapshot,value}=stage;
 const origins=remoteChildOrigins.get(activeId)?.sources;if(origins)delete origins[side];
 if(value.documentProjection)textProjections[side]=value.documentProjection;else delete textProjections[side];
 textPaths[side]=snapshot.path;textFormats[side]=value.format;textInputEncodings[side]=value.format.encoding;revisions[side]=snapshot.revision;
 return value;
}
async function folderOpenScope(service) {
 const roots={};
 for(const side of ['a','b'])if(service.roots[side]){const root=await service.directoryPath(side),stat=await fs.lstat(root,{bigint:true});roots[side]={path:root,dev:stat.dev,ino:stat.ino};}
 return async()=>{for(const side of ['a','b']){const root=roots[side];if(!root){if(service.roots[side])throw Error('The folder roots changed while opening.');continue;}const current=await service.directoryPath(side),stat=await fs.lstat(current,{bigint:true});if(current!==root.path||stat.dev!==root.dev||stat.ino!==root.ino||await fs.realpath(current)!==current)throw Error('The folder root changed while opening. Select it again.');}};
}
function snapshotAuthorities(values,snapshots) {
 const result=new Map();for(const side of ['a','b','base'])if(values[side]){const snapshot=snapshots[side],token=randomUUID();values[side].diskToken=token;result.set(token,{path:snapshot.path,dev:BigInt(snapshot.dev),ino:BigInt(snapshot.ino),sourceKind:protectedDataSourceKind(snapshot.path)});}return result;
}
async function stageFolderFiles(service,relatives,binary,encodings={a:'auto',b:'auto'}) {
 const values={},stages={},snapshots={},omitted={};
 const omittedState=async(side,relative)=>{try{const file=await service.safe(side,relative),stat=await fs.lstat(file,{bigint:true});return `${file}:${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return 'missing';throw error;}};
 for(const side of ['a','b']){
  const relative=relatives[side];if(!relative||!service.roots[side]){values[side]=null;continue;}
  let file,stat;try{file=await service.safe(side,relative);stat=await fs.lstat(file,{bigint:true});}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code)){values[side]=null;omitted[side]='missing';continue;}throw error;}
  if(!stat.isFile()){values[side]=null;omitted[side]=`${file}:${stat.dev}:${stat.ino}:${stat.mode}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;continue;}
  if(binary){const read=await localSnapshot.read(file);snapshots[side]=read.snapshot;values[side]={name:path.basename(file),path:file,data:read.bytes.toString('base64')};}
  else{stages[side]=await stageText(file,encodings[side]);snapshots[side]=stages[side].snapshot;values[side]=stages[side].value;}
 }
 if(!values.a&&!values.b)throw Error('This file is no longer available.');
 return {values,stages,snapshots,validate:async()=>{for(const side of Object.keys(omitted))if(await omittedState(side,relatives[side])!==omitted[side])throw Error('The folder entry changed while opening.');for(const side of ['a','b'])if(snapshots[side]){if(await service.safe(side,relatives[side])!==snapshots[side].path)throw Error('The folder entry changed while opening.');await localSnapshot.validate(snapshots[side]);}}};
}

async function dataAuthority(file) {
  const stat = await fs.lstat(file,{bigint:true});
  if (!stat.isFile() || await fs.realpath(file) !== file) throw new Error('Choose a regular file from disk again.');
  return {path:file,dev:stat.dev,ino:stat.ino};
}
async function checkDataAuthority(authority) {
  const current = await dataAuthority(authority.path);
  if (current.dev !== authority.dev || current.ino !== authority.ino) throw new Error('The disk file was replaced. Reopen the input before opening it externally.');
}

function assertSender(event) {
  if (!mainWindow || mainWindow.isDestroyed() ||
      event.sender !== mainWindow.webContents ||
      event.senderFrame !== mainWindow.webContents.mainFrame ||
      event.senderFrame.url !== entryURL) {
    throw new Error('This operation is only available from the application window.');
  }
}

function sideValue(side) {
  if (side !== 'a' && side !== 'b') throw new Error('Choose a valid folder side.');
  return side;
}

function relativePathValue(value) {
  if (typeof value !== 'string' || !value || value.length > 32768 ||
      value.includes('\0') || path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    throw new Error('Invalid relative file path.');
  }
  return value;
}

function registerHandlers() {
  const handle = (channel, fn) => handlers.set(channel, async (...args) => {
    if(disposed)throw Error('This application window is closed.');
    assertRemoteAction(channel,args);
    if(['folders:tree-name-rules','folders:tree-align','folders:tree-clear-alignment','folders:matching','folders:choose','folders:navigate','session:swap','session:reset','session:create'].includes(channel))revokeTransfer(activeId);
    if ((folderTrees.get(folders)?.matchingMode==='filename'||folderTrees.get(folders)?.alignment.pairs.length) && ['folders:action','folders:preview','folders:open-data','folders:open-files','folders:read'].includes(channel)) throw new Error('Select the aligned row again before using this action.');
    running++;
    try{return await fn(...args);}finally{running--;}
  });
  handle('window:new',()=>{shared.createWindow();return {created:true};});
  handle('sftp:profiles-list',()=>shared.sftpProfiles.list());
  handle('sftp:profiles-save',profile=>shared.sftpProfiles.save(profile));
  handle('sftp:profiles-remove',id=>shared.sftpProfiles.remove(id));
  // These transport-only calls capture explicit native session ownership before
  // awaiting and do not enter the application operation queue. This lets both
  // session close and actual window close abort a held probe/connect/review.
  const sftpHandleIPC=(channel,fn)=>immediateHandlers.set(channel,(event,id,...args)=>{assertSender(event);const entry=sftpSession(id);return fn(entry,...args);});
  sftpHandleIPC('sftp:key-choose',async entry=>{
    const ticket=sftpKeys.begin(entry.owner);
    let selected;try{selected=await dialog.showOpenDialog(mainWindow,{title:'Choose SSH private key',properties:['openFile']});}catch{throw Error('Unable to open the SSH key picker.');}
    if(!sftpKeys.current(entry.owner,ticket))throw Error('This SSH key selection is no longer available.');
    if(selected.canceled||!selected.filePaths[0])return null;
    return sftpKeys.select(entry.owner,ticket,selected.filePaths[0]);
  });
  sftpHandleIPC('sftp:key-discard',(entry,keyId)=>{sftpHandle(keyId);return sftpKeys.discard(entry.owner,keyId);});
  sftpHandleIPC('sftp:probe',(entry,config,slot='default')=>{
    const attempt=sftpRegistry.beginProbe(entry.owner,config,{slot});
    const retained={promise:attempt.review,timer:null};entry.reviews.set(attempt.attemptId,retained);
    attempt.review.then(review=>{
      if(entry.reviews.get(attempt.attemptId)!==retained)return;
      retained.timer=setTimeout(()=>entry.reviews.delete(attempt.attemptId),Math.max(0,review.expiresAt-Date.now()));retained.timer.unref?.();
    },()=>{entry.reviews.delete(attempt.attemptId);});
    return {attemptId:attempt.attemptId};
  });
  sftpHandleIPC('sftp:review',(entry,attemptId)=>{
    sftpHandle(attemptId);const review=entry.reviews.get(attemptId);if(!review)throw Error('This SFTP review is no longer available.');return review.promise;
  });
  sftpHandleIPC('sftp:connect',(entry,request)=>{
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['attemptId','approvalToken','approved','rememberHost','credentials'].includes(key)))throw Error('Invalid SFTP connection request.');
    sftpHandle(request.attemptId);let selected;
    if(request.credentials?.keyId!==undefined){
      const credentials=request.credentials;
      if(Object.keys(credentials).some(key=>!['username','keyId','passphrase'].includes(key))||typeof credentials.username!=='string'||credentials.passphrase!==undefined&&(typeof credentials.passphrase!=='string'||credentials.passphrase.length>65536))throw Error('Invalid SSH key credentials.');
      sftpHandle(credentials.keyId);selected=sftpKeys.take(entry.owner,credentials.keyId);
      request={...request,credentials:{username:credentials.username,privateKey:selected.bytes,...(credentials.passphrase!==undefined?{passphrase:credentials.passphrase}:{})}};
    }
    try{const pending=sftpRegistry.connect(entry.owner,request);clearTimeout(entry.reviews.get(request.attemptId)?.timer);entry.reviews.delete(request.attemptId);return Promise.resolve(pending).finally(()=>selected?.release());}catch(error){selected?.release();throw error;}
  });
  sftpHandleIPC('sftp:forget-host',(entry,request)=>{
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(key=>!['attemptId','approvalToken'].includes(key)))throw Error('Invalid saved server key request.');
    sftpHandle(request.attemptId);
    const pending=sftpRegistry.forgetHost(entry.owner,request);
    clearTimeout(entry.reviews.get(request.attemptId)?.timer);entry.reviews.delete(request.attemptId);
    return pending;
  });
  sftpHandleIPC('sftp:list',entry=>sftpRegistry.list(entry.owner));
  sftpHandleIPC('sftp:cancel',(entry,attemptId)=>{sftpHandle(attemptId);clearTimeout(entry.reviews.get(attemptId)?.timer);entry.reviews.delete(attemptId);return sftpRegistry.cancel(entry.owner,attemptId);});
  sftpHandleIPC('sftp:disconnect',(entry,connectionId)=>{
    sftpHandle(connectionId);for(const [id,attachment] of entry.attachments)if(attachment.connectionId===connectionId){clearTimeout(attachment.timer);entry.attachments.delete(id);}
    // Retained child tabs own separate handles. Revoke this owner's providers
    // immediately even when another tab keeps the physical connection alive.
    for(const [sessionId,owner] of sftpSessions)if(owner===entry){
      const service=sessionId===activeId?folders:contexts.get(sessionId)?.folders;
      if(service){let changed=false;for(const endpoint of Object.values(remoteRoots.get(service)||{}))if(endpoint?.descriptor.connectionId===connectionId){endpoint.provider.revoke();changed=true;}if(changed)invalidateTree(service);}
    }
    return sftpRegistry.disconnect(entry.owner,connectionId);
  });
  const prepareAttachment=async(id,side,connectionId,root)=>{
    sideValue(side);sftpHandle(connectionId);const entry=sftpSession(id),service=id===activeId?folders:contexts.get(id).folders;
    if(executing)throw Error('Wait for the current operation to finish before attaching a remote folder.');
    if(entry.attachments.size>=32)throw Error('Too many staged remote folders.');
    const connection=sftpRegistry.getConnection(entry.owner,connectionId),previousTree=treeFor(service),previousRoots=JSON.stringify(service.roots);
    const provider=await SftpFolderProvider.create(connection,root);
    const attachment={id,side,connectionId,entry,service,connection,previousTree,previousRoots,provider,expiresAt:Date.now()+60000};
    validateAttachment(attachment);
    if(entry.attachments.size>=32)throw Error('Too many staged remote folders.');
    const attachmentId=randomUUID();attachment.timer=setTimeout(()=>entry.attachments.delete(attachmentId),60000);attachment.timer.unref?.();entry.attachments.set(attachmentId,attachment);
    return {attachmentId,descriptor:attachmentDescriptor(attachment)};
  };
  const validateAttachment=attachment=>{
    const {id,entry,service,connection,connectionId,previousTree,previousRoots}=attachment;
    if(disposed||sftpBlocked.has(id)||sftpSessions.get(id)!==entry||!contexts.has(id)||(id===activeId?folders:contexts.get(id).folders)!==service||folderTrees.get(service)!==previousTree||JSON.stringify(service.roots)!==previousRoots||connection.closed||executing||Date.now()>=attachment.expiresAt)throw Error('The folder or connection changed. Attach the remote folder again.');
    if(sftpRegistry.getConnection(entry.owner,connectionId)!==connection)throw Error('The SFTP connection changed.');
  };
  const attachmentDescriptor=({provider,connection,connectionId,entry})=>({name:path.posix.basename(provider.root)||provider.root,path:provider.root,host:connection.host,port:connection.port,username:sftpRegistry.list(entry.owner).connections.find(item=>item.connectionId===connectionId)?.username,remote:true,connectionId,capabilities:{...provider.capabilities}});
  // Commit deliberately has no await. The dialog disables cancellation before
  // dispatch and applies its acknowledgement, avoiding a response/cancel race.
  const commitAttachment=(id,attachmentId)=>{
    sftpHandle(attachmentId);const entry=sftpSession(id),attachment=entry.attachments.get(attachmentId);if(!attachment)throw Error('This staged remote folder is no longer available.');
    entry.attachments.delete(attachmentId);clearTimeout(attachment.timer);validateAttachment(attachment);
    const {service,side,provider,previousTree}=attachment,descriptor=attachmentDescriptor(attachment);
    if(remoteChildJobs.get(service)?.size&&Object.values(remoteRoots.get(service)||{}).some(endpoint=>endpoint?.provider.connection===attachment.connection))throw Error('Wait for files on this connection to finish opening before reusing it.');
    const previousConnectionId=remoteRoots.get(service)?.[side]?.descriptor.connectionId;
    const pending=pendingRemoteRoots.get(service),saved=pending?.[side],attached=validateRemoteFolderDescriptor({protocol:'sftp',host:descriptor.host,port:descriptor.port,username:descriptor.username,root:provider.root});
    const restoreAlignment=saved&&['protocol','host','port','username','root'].every(key=>saved[key]===attached[key]);
    remoteRoots.set(service,{...remoteRoots.get(service),[side]:{provider,descriptor}});delete service.roots[side];
    if(pending){delete pending[side];if(!hasPendingRemote(service))pendingRemoteRoots.delete(service);}
    service.plans.clear();service.hashCache.clear();attributePlans.delete(id);void dropFolderPatch(id).catch(()=>{});
    if(id===activeId)pendingPreview=null;else contexts.get(id).pendingPreview=null;
    replaceTree(service,new FolderTree(treeService(service),restoreAlignment?previousTree.manualAlignment:undefined,previousTree.nameRules));
    // Release only this session's displaced handle after publication. Another root
    // may still use it; retained child handles own independent transport leases.
    if(previousConnectionId&&previousConnectionId!==descriptor.connectionId&&!Object.values(remoteRoots.get(service)||{}).some(endpoint=>endpoint?.descriptor.connectionId===previousConnectionId))void sftpRegistry.disconnect(entry.owner,previousConnectionId).catch(()=>{});
    return descriptor;
  };
  immediateHandlers.set('sftp:prepare-attach',(event,id,side,connectionId,root)=>{assertSender(event);return prepareAttachment(id,side,connectionId,root);});
  handle('sftp:commit-attach',(id,attachmentId)=>commitAttachment(id,attachmentId));
  // Native one-shot convenience. Cancellable dialogs use prepare + commit.
  immediateHandlers.set('sftp:attach',async(event,id,side,connectionId,root)=>{assertSender(event);const staged=await prepareAttachment(id,side,connectionId,root);return scheduleCommit(()=>commitAttachment(id,staged.attachmentId));});



  handle('folders:patch-preview',async(side,patch,options)=>{
    sideValue(side);if(!activeId||!contexts.has(activeId))throw Error('Open a folder comparison first.');
    const context=activeId,owner=folders,root=await owner.directoryPath(side);await dropFolderPatch(context);
    const service=new FolderPatch({backupRoot:owner.backupRoot});
    try{const preview=await service.preview(root,patch,options);for(const entry of preview.entries||[])if(entry.action==='rename')shared.checkAlignmentRename(path.join(root,...entry.oldPath.split('/')),path.join(root,...entry.newPath.split('/')));folderPatchPlans.set(context,{service,owner,root,side,id:preview.id,entries:preview.entries||[]});return preview;}catch(error){await service.dispose().catch(()=>{});throw error;}
  });
  handle('folders:patch-cancel',async id=>{if(typeof id!=='string'||id.length>200)throw Error('Invalid patch preview.');for(const [context,plan]of folderPatchPlans)if(plan.id===id){await dropFolderPatch(context);return {cancelled:true};}return {cancelled:true};});
  handle('folders:patch-execute',async id=>{
    const context=activeId,plan=folderPatchPlans.get(context);
    if(typeof id!=='string'||id.length>200||!plan||plan.id!==id)throw Error('Folder or session changed. Preview the patch again.');
    if(plan.owner!==folders||folders.roots[plan.side]!==plan.root){await dropFolderPatch(context);throw Error('Folder or session changed. Preview the patch again.');}
    if(executing)throw Error('A folder operation is already running.');executing=true;
    try{
      const answer=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Apply folder patch?',message:'Apply the reviewed patch to the '+(plan.side==='a'?'left':'right')+' folder?',detail:plan.root+'\n\nReplaced and deleted files are backed up before writing. An interrupted operation may be partially applied; inspect its backup and result before retrying.',buttons:['Cancel','Apply patch'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return {cancelled:true};
      for(const entry of plan.entries)if(entry.action==='rename')shared.checkAlignmentRename(path.join(plan.root,...entry.oldPath.split('/')),path.join(plan.root,...entry.newPath.split('/')));
      folderPatchPlans.delete(context);
      try{
        const outcome=await plan.service.execute(id),remappedContexts=[];
        for(const entry of plan.entries)if(entry.action==='rename')remappedContexts.push(...shared.remapRenamedContexts(mainWindow,path.join(plan.root,...entry.oldPath.split('/')),path.join(plan.root,...entry.newPath.split('/'))));
        return {...outcome,remappedContexts};
      }finally{await plan.service.dispose().catch(()=>{});folders.hashCache.clear();folders.plans.clear();pendingPreview=null;invalidateTree();}
    }catch(error){
      // Pre-execution failures also consume their staged preview. Cancellation
      // above is the only outcome that intentionally retains it for retry.
      if(folderPatchPlans.get(context)===plan)try{await dropFolderPatch(context);}catch(cleanupError){error.message+=' '+cleanupError.message;}
      throw error;
    }finally{executing=false;}
  });

  immediateHandlers.set('batch:cancel',(event,token)=>{assertSender(event);return batchService.cancel(token);});
  handle('batch:preview', async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:'Choose comparison batch',properties:['openFile'],filters:[{name:'JSON batch script',extensions:['json']}]});if(result.canceled||!result.filePaths[0])return null;return batchService.preview(result.filePaths[0]);});
  handle('batch:execute', token=>batchService.execute(token,async count=>{const result=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['Cancel','Run batch'],defaultId:0,cancelId:0,message:`Create reports for ${count} comparison jobs?`,detail:'Runs the reviewed comparisons and creates new report files. Existing reports are never overwritten. Successful reports remain if another job fails.'});return result.response===1;}));

  handle('threeway:select', async side => {
    if (!['base','left','right'].includes(side)) throw new Error('Choose base, left or right.');
    const result = await dialog.showOpenDialog(mainWindow,{title:`Choose ${side} folder`,properties:['openDirectory']});
    return result.canceled || !result.filePaths.length ? null : threeWayFor().select(side,result.filePaths[0]);
  });
  handle('threeway:analyze', () => threeWayFor().analyze());
  handle('threeway:resolve', (choices,revision) => threeWayFor().resolve(choices,revision));
  handle('threeway:select-output', async () => {
    const result=await dialog.showOpenDialog(mainWindow,{title:'Choose merged output folder',properties:['openDirectory','createDirectory']});
    return result.canceled||!result.filePaths.length?null:threeWayFor().selectOutput(result.filePaths[0]);
  });
  handle('threeway:preview', (choices,revision) => threeWayFor().preview(choices,revision));
  handle('threeway:recovery-list', () => threeWayRecovery.list());
  handle('threeway:recovery-inspect', id => threeWayRecovery.inspect(id));
  handle('threeway:recovery-restore', async token => {
    if(typeof token!=='string'||token.length>200)throw new Error('Review recovery operations before restoring.');
    if(executing)throw new Error('A folder operation is already running.');
    executing=true;
    try{
      const plan=await threeWayRecovery.verify(token);
      if(!plan.operations.length)return {completed:0,backupPath:null};
      const confirmation=await dialog.showMessageBox(mainWindow,{
        type:'warning',title:'Restore reviewed folder output?',message:`Restore using ${plan.operations.length} reviewed operations?`,
        detail:`Output: ${plan.output.path}\n\nThis restores the output entries listed in the recovery preview. Current affected files are backed up before changes begin.`,
        buttons:['Cancel','Restore output'],defaultId:0,cancelId:0,noLink:true
      });
      if(confirmation.response!==1)return {cancelled:true};
      try{return await threeWayRecovery.execute(token);}
      catch(error){
        if(error.backupPath)throw new Error(`${error.message}\nStopped after ${error.completed||0} completed operations. Backups and recovery record: ${error.backupPath}${error.manifestError?`\nRecovery record update failed: ${error.manifestError}`:''}`);
        throw error;
      }
    }finally{executing=false;}
  });
  handle('threeway:apply', async id => {
    if(typeof id!=='string'||id.length>200)throw new Error('Review output changes before applying them.');
    if(executing)throw new Error('A folder operation is already running.');
    executing=true;
    try{
      const service=threeWayFor(),plan=await service.verifyPreview(id);
      if(!plan.operations.length)return {completed:0,backupPath:null};
      const confirmation=await dialog.showMessageBox(mainWindow,{
        type:'warning',title:'Apply merged folder output?',message:`Apply ${plan.operations.length} reviewed operations?`,
        detail:`Output: ${plan.output.path}\n\nThis replaces and removes output entries as listed in the preview. Existing affected files are backed up before changes begin. The base, left and right inputs are not modified.`,
        buttons:['Cancel','Apply changes'],defaultId:0,cancelId:0,noLink:true
      });
      if(confirmation.response!==1)return {cancelled:true};
      try {return await service.execute(id);}
      catch(error){
        if(error.backupPath)throw new Error(`${error.message}\nStopped after ${error.completed||0} completed operations. Backups and recovery record: ${error.backupPath}${error.manifestError?`\nRecovery record update failed: ${error.manifestError}`:''}`);
        throw error;
      }
    }finally{executing=false;}
  });
  handle('keyboard:get',async()=>{shared.shortcutOverrides=await shared.shortcutStore.get();buildApplicationMenu();return shortcutState();});
  handle('keyboard:save',async(value,expected)=>{shared.shortcutOverrides=await shared.shortcutStore.save(value,expected);buildApplicationMenu();return shortcutState();});
  immediateHandlers.set('editor:history',(event,action)=>{assertSender(event);if(action!=='undo'&&action!=='redo')throw Error('Choose undo or redo.');mainWindow.webContents[action]();return true;});
  immediateHandlers.set('keyboard:capture',(event,active)=>{assertSender(event);if(typeof active!=='boolean')throw Error('Invalid shortcut capture state.');mainWindow?.webContents.setIgnoreMenuShortcuts(active);return active;});
  handle('file-action-history:get', () => fileActionHistory.get());
  handle('file-action-history:enable', (enabled,entries) => fileActionHistory.setEnabled(enabled,entries));
  handle('file-action-history:append', entry => fileActionHistory.append(entry));
  handle('file-action-history:clear', () => fileActionHistory.clear());
  handle('session:defaults-all', () => sessionDefaults.all());
  handle('settings:apply-preferences', async(value,expected) => {
    let result,failure;try{result=await applyTransferredPreferences(value,expected,{externalEditor,sessionDefaults,shortcutStore:shared.shortcutStore,shortcutCatalog:shared.shortcutCatalog});}catch(error){failure=error;}
    try{shared.shortcutOverrides=await shared.shortcutStore.get();buildApplicationMenu();}catch(error){throw Error((failure?failure.message+' ':'')+'Could not refresh keyboard shortcuts: '+error.message+' Review current preferences before trying again.');}
    if(failure)throw failure;return result;
  });
  handle('session:defaults-get', type => sessionDefaults.get(type));
  handle('session:defaults-preview', async data => {
    const profile=captureSessionDefaults(data);
    return {profile,existing:await sessionDefaults.get(profile.type)};
  });
  handle('session:defaults-save', (profile,expected) => sessionDefaults.save(profile,expected));
  handle('session:defaults-reset', (type,expected) => sessionDefaults.remove(type,expected));
  handle('settings:export', async preferences => {
    const settings=normalizeSettingsTransfer({kind:'further-compare-settings',version:1,platform:process.platform,display:preferences?.display,folderColumns:preferences?.folderColumns,externalEditor:await externalEditor.settings(),sessionDefaults:await sessionDefaults.all(),keyboardShortcuts:await shared.shortcutStore.get()},shared.shortcutCatalog);
    const selected=await dialog.showSaveDialog(mainWindow,{title:'Export application settings',defaultPath:'Further-Compare.fcsettings',filters:[{name:'Further Compare settings',extensions:['fcsettings']}]});
    if(selected.canceled||!selected.filePath)return {cancelled:true};await writeSettingsTransfer(selected.filePath,settings,shared.shortcutCatalog);return {path:selected.filePath};
  });
  handle('settings:import', async()=>{
    const selected=await dialog.showOpenDialog(mainWindow,{title:'Import application settings',properties:['openFile'],filters:[{name:'Further Compare settings',extensions:['fcsettings','json']}]});
    if(selected.canceled||!selected.filePaths?.length)return null;return readSettingsTransfer(selected.filePaths[0],process.platform,shared.shortcutCatalog);
  });
  handle('settings:apply-editor',async(value,expected)=>{
    const before=validateEditorSettings(expected),current=await externalEditor.settings();if(JSON.stringify(before)!==JSON.stringify(current))throw Error('External editor preferences changed. Import or reset again to review the latest settings.');
    return externalEditor.save(value);
  });
  handle('editor:settings', () => externalEditor.settings());
  handle('editor:choose', async () => {
    const result = await dialog.showOpenDialog(mainWindow,{title:'Choose external editor',properties:['openFile'],...(process.platform === 'win32' ? {filters:[{name:'Applications',extensions:['exe']}]} : {})});
    return result.canceled ? null : result.filePaths[0];
  });
  handle('editor:save-settings', value => externalEditor.save(value));
  handle('editor:open', async request => {
    if (!request || Object.getPrototypeOf(request) !== Object.prototype || Object.keys(request).some(key => !['source','side','relative','token','id','revision'].includes(key)) || !['text','folder','folder-tree','advanced'].includes(request.source)) throw new Error('Invalid editor request.');
    sideValue(request.side);
    let file, authority, rowTree, rowPath;
    if (request.source === 'folder-tree') {
      rowTree = treeRevision(request.revision);
      rowIds([request.id]);
      const entry = await rowTree.resolve(request.id,request.side,request.revision);
      if (entry.kind !== 'file') throw new Error('Select a regular file.');
      rowPath = entry.path; file = await folders.safe(request.side,rowPath);
    } else if (request.source === 'advanced') {
      if (typeof request.token !== 'string' || !dataAuthorities.has(request.token) || request.relative !== undefined) throw new Error('Open this input from disk first. Saved sessions and archive entries contain embedded data.');
      authority = dataAuthorities.get(request.token);
      await checkDataAuthority(authority);
      file = authority.path;
    } else if (request.source === 'folder') {
      relativePathValue(request.relative);
      file = await folders.safe(request.side,request.relative);
      if (!(await fs.lstat(file)).isFile()) throw new Error('Select a regular file.');
      await folders.safe(request.side,request.relative);
    } else {
      file = textPaths[request.side];
      if (!file) throw new Error('Open or save a file on disk first.');
    }
    const original = await fs.lstat(file,{bigint:true});
    if (!original.isFile()) throw new Error('Select a regular file.');
    return externalEditor.launch(file, file => shell.openPath(file), async () => {
      if (authority) await checkDataAuthority(authority);
      if (rowTree) { await rowTree.resolve(request.id,request.side,request.revision); await folders.safe(request.side,rowPath); }
      if (request.source === 'folder') await folders.safe(request.side,request.relative);
      const current = await fs.lstat(file,{bigint:true});
      if (!current.isFile() || current.dev !== original.dev || current.ino !== original.ino) throw new Error('The file changed before it could be opened. Select it again.');
    });
  });

  handle('shell:explorer-integration', async request => {
    if(!explorerIntegrationService){explorerIntegrationService=require('./windows-explorer-integration.cjs').getWindowsExplorerIntegration(app,{platform:process.platform,appPath:process.execPath});explorerIntegrationOwner=mainWindow.webContents.id;}
    return explorerIntegrationService.run(request,{owner:explorerIntegrationOwner});
  });

  handle('shell:finder-integration', async action => {
    if (!['status','install','uninstall'].includes(action)) throw new Error('Unknown Finder integration action.');
    if (!app.isPackaged || process.platform !== 'darwin' || !shared.finderIntegration) {
      return {supported:false,bundled:false,registered:false,enabled:false,status:'unavailable',reason:'Finder menus are available in the packaged Mac app.'};
    }
    return shared.finderIntegration.run(action);
  });

  let shellRefreshWarning = '', shellRefreshAction = '';
  handle('shell:integration', async action => {
    if (!['status','install','uninstall'].includes(action)) throw new Error('Unknown shell integration action.');
    if (!app.isPackaged || !['darwin','win32'].includes(process.platform)) return {supported:false,installed:false,reason:'Install shell integration from a packaged Mac or Windows app.'};
    if (process.platform === 'darwin') {
      const location = path.join(app.getPath('home'),'Library','Services');
      if (action !== 'status') {
        await shellIntegration.generate({app:path.resolve(process.execPath,'../../..'),output:location,uninstall:action==='uninstall'});
        // Refresh the per-user Services database without restarting Finder.
        try { await execFileAsync('/System/Library/CoreServices/pbs',['-update'],{timeout:15000}); shellRefreshWarning = ''; shellRefreshAction = ''; }
        catch { shellRefreshAction = action; shellRefreshWarning = 'Integration files were ' + (action === 'uninstall' ? 'removed' : 'installed') + ', but macOS could not refresh its Services menu. Retry the refresh, or sign out and back in.'; }
      }
      const installed = await shellIntegration.inspectMac(location,path.resolve(process.execPath,'../../..'));
      return {supported:true,installed:typeof installed === 'boolean' ? installed : installed.installed,partial:Boolean(installed.partial),stale:Boolean(installed.stale),...(shellRefreshWarning?{refreshWarning:shellRefreshWarning,refreshAction:shellRefreshAction}:{}),location};
    }
    // Shared across windows: serialize status and mutations for the same registry keys.
    const integration = require('./windows-shell-integration.cjs').getWindowsShellIntegration(app,{appPath:process.execPath,tempRoot:app.getPath('temp'),scriptPath:path.join(__dirname,'native','shell-menu.ps1'),systemRoot:process.env.SystemRoot||'C:\\Windows',fs,execFile:execFileAsync});
    return integration.run(action);
  });
  handle('shell:state', () => shellRequests.state());
  handle('shell:set-left', side => {
    sideValue(side);
    if (!textPaths[side]) throw new Error('Open a file from disk before setting it as left.');
    return shellRequests.setLeft(textPaths[side]);
  });
  handle('shell:clear-left', () => shellRequests.clear());
  handle('shell:pending',()=>shared.isShellRecipient(mainWindow)&&shellRequests.queue.length>0);
  handle('shell:take', async () => {
    if(!shared.isShellRecipient(mainWindow))return null;
    const current=openOwner('The active comparison changed while reviewing the shell request. Try again.');
    current();
    const request = await shellRequests.take({reviewURL:async ({command,files})=>{
      current();
      const action={'--fc-set-left':'Set as Left','--fc-compare-left':'Compare with Left','--fc-compare-selected':'Compare Selected'}[command];
      if(!action)return false;
      const answer=await dialog.showMessageBox(mainWindow,{type:'question',title:'Further Compare',message:'Allow file comparison request?',detail:`Requested action: ${action}\n\n${files.map(file=>JSON.stringify(file.path).replace(/\p{Cf}/gu,char=>'\\u{'+char.codePointAt(0).toString(16)+'}')).join('\n\n')}\n\nA Finder extension or another application requested this action. Continue only if you initiated it.`,buttons:['Cancel','Continue'],defaultId:0,cancelId:0,noLink:true});
      current();return answer.response===1;
    },reviewSelection:async ({left,right,kind})=>{
      current();const answer=await dialog.showMessageBox(mainWindow,{type:'question',title:'Further Compare',message:'Compare selected items',detail:`Left: ${JSON.stringify(left.path).replace(/\p{Cf}/gu,char=>'\\u{'+char.codePointAt(0).toString(16)+'}')}\n\nRight: ${JSON.stringify(right.path).replace(/\p{Cf}/gu,char=>'\\u{'+char.codePointAt(0).toString(16)+'}')}\n\nCompare these ${kind==='folder'?'folders':'files'} in this order, or swap the sides.`,buttons:['Cancel','Compare','Swap and Compare'],defaultId:1,cancelId:0,noLink:true});
      current();return answer.response===1?'compare':answer.response===2?'swap':'cancel';
    },reviewComparison:async ({left,right,choices})=>{
      current();
      if(!Array.isArray(choices)||!choices.length||choices.length>2||new Set(choices).size!==choices.length||choices.some(mode=>!['text-compare','binary-compare'].includes(mode)))throw Error('Invalid shell comparison choices.');
      const labels={'text-compare':'Text','binary-compare':'Binary'},literal=value=>JSON.stringify(value).replace(/\p{Cf}/gu,char=>'\\u{'+char.codePointAt(0).toString(16)+'}');
      const offered=choices.slice();
      const answer=await dialog.showMessageBox(mainWindow,{type:'question',title:'Further Compare',message:'Choose how to compare these files',detail:`Left: ${literal(left.path)}\n\nRight: ${literal(right.path)}\n\nText compares readable text or extracted document text. Binary compares original bytes.`,buttons:['Cancel',...offered.map(mode=>labels[mode])],defaultId:0,cancelId:0,noLink:true});
      current();
      return Number.isInteger(answer.response)&&answer.response>0&&answer.response<=offered.length?offered[answer.response-1]:'cancel';
    }});
    current();
    if (!request || request.action === 'clear-left' || request.action === 'cancelled') return request;
    if(request.mode==='folder-compare'){
      const origin=activeId,staged=createFolderService(folders.backupRoot),selected={a:null,b:null},stamps={};
      for(const side of ['a','b'])if(request[side]){
        const input=request[side].path,stat=await fs.lstat(input,{bigint:true});
        if(!stat.isDirectory()||await fs.realpath(input)!==input)throw Error('A shell folder changed. Select it again.');
        stamps[side]=`${stat.dev}:${stat.ino}`;selected[side]=await staged.select(side,input);
      }
      for(const side of ['a','b'])if(selected[side]){
        const input=selected[side].path,stat=await fs.lstat(input,{bigint:true});
        if(!stat.isDirectory()||`${stat.dev}:${stat.ino}`!==stamps[side]||await fs.realpath(input)!==input)throw Error('A shell folder changed. Select it again.');
      }
      current();if(activeId!==origin)throw Error('The active comparison changed. Try again.');
      const {id}=createContext();folders=staged;rememberContext();return {...request,id,folders:selected};
    }
    // Stage every read and revision before changing the active tab's authority.
    const originalFiles = await shellRequests.validateFiles(request);
    current();
    const stagedRevisions = {}, stagedAuthorities = new Map();
    for (const side of ['a','b']) if (request[side]) {
      const original = originalFiles[side];
      if (request.mode === 'text-compare') stagedRevisions[side] = original.revision;
      else {
        const token = randomUUID();
        request[side].diskToken = token;
        stagedAuthorities.set(token,{path:original.path,dev:BigInt(original.dev),ino:BigInt(original.ino),sourceKind:protectedDataSourceKind(original.path)});
      }
    }
    const {id} = createContext();
    dataAuthorities = stagedAuthorities;
    if (request.mode === 'text-compare') for (const side of ['a','b']) if (request[side]) {
      textPaths[side] = request[side].path;
      textFormats[side] = request[side].format;
      textInputEncodings[side] = request[side].format.encoding;
      if(request[side].documentProjection)textProjections[side]=request[side].documentProjection;
      revisions[side] = stagedRevisions[side];
    }
    return {id,...request};
  });
  handle('session:compare-parents', async request => {
    if(executing)throw new Error('Wait for the current folder operation to finish.');
    if(!request||!['text','advanced','folder'].includes(request.source))throw new Error('Choose a comparison with disk inputs.');
    const origin=activeId,inputs={},authorities={};
    for(const side of ['a','b']){
      if(request.source==='advanced'){
        const token=request.tokens?.[side];
        if(typeof token!=='string'||!dataAuthorities.has(token))throw new Error('Open both inputs from disk first.');
        authorities[side]=dataAuthorities.get(token);await checkDataAuthority(authorities[side]);inputs[side]=authorities[side].path;
      }else inputs[side]=request.source==='folder'?folders.roots[side]:textPaths[side];
      if(!inputs[side])throw new Error('Open both inputs from disk first.');
    }
    const staged=createFolderService(folders.backupRoot),selected={},stamps={};
    for(const side of ['a','b']){
      const stat=await fs.lstat(inputs[side],{bigint:true});
      if(request.source==='folder'?!stat.isDirectory():!stat.isFile())throw new Error('An input changed type. Open it again.');
      if(await fs.realpath(inputs[side])!==inputs[side])throw new Error('An input changed location. Open it again.');
      stamps[side]=`${stat.dev}:${stat.ino}`;
      selected[side]=await staged.select(side,path.dirname(inputs[side]));
    }
    for(const side of ['a','b']){
      const stat=await fs.lstat(inputs[side],{bigint:true});
      if(`${stat.dev}:${stat.ino}`!==stamps[side]||await fs.realpath(inputs[side])!==inputs[side])throw new Error('An input changed. Open it again.');
      if(authorities[side])await checkDataAuthority(authorities[side]);
    }
    if(activeId!==origin)throw new Error('The active comparison changed. Try again.');
    const {id}=createContext();folders=staged;rememberContext();
    return {id,folders:selected};
  });
  handle('session:create', () => createContext());
  handle('clipboard:read-text', () => {
    const text = clipboard.readText();
    if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) throw new Error('Clipboard text exceeds 10 MB.');
    if (text.includes('\0')) throw new Error('The clipboard contains binary data. Copy text before comparing.');
    return text;
  });
  handle('session:activate', id => activateContext(id));
  handle('session:close', async id => {
    if (typeof id !== 'string' || !contexts.has(id)) throw new Error('This session is no longer open.');
    const remoteCleanup=revokeSftpSession(id);
    try {
    await Promise.all([dropFolderPatch(id),remoteCleanup]);attributePlans.delete(id);
    rememberContext();
    const closing=contexts.get(id);folderTrees.get(closing.folders)?.dispose();closing.dataAuthorities.clear();closing.pendingPreview=null;closing.folders.plans.clear();closing.folders.hashCache.clear();
    if (activeId === id) {
      activeId = null;dataAuthorities=new Map();
      textPaths = {}; sessionPath = null; pendingPreview = null; revisions = {}; textFormats = {}; textInputEncodings = {}; textProjections = {};
      folders = createFolderService(path.join(app.getPath('userData'), 'backups'));
    }
    contexts.delete(id);
    return true;
    } finally {sftpBlocked.delete(id);}
  });
  handle('text:changes', async () => {
    const changed = {a:false,b:false};
    for (const side of ['a','b']) if (textPaths[side]) changed[side] = await revision(textPaths[side]) !== revisions[side];
    return changed;
  });

  immediateHandlers.set('folders:matching-cancel',(event,request)=>{assertSender(event);if(typeof request!=='string'||!/^[a-f0-9-]{36}$/.test(request))throw Error('Invalid matching request.');if(filenameScan?.request===request)filenameScan.cancelled=true;else{cancelledFilenameScans.add(request);if(cancelledFilenameScans.size>100)cancelledFilenameScans.delete(cancelledFilenameScans.values().next().value);}return true;});
  handle('folders:matching',async(mode,request)=>{
    if(!['path','filename'].includes(mode)||typeof request!=='string'||!/^[a-f0-9-]{36}$/.test(request))throw Error('Choose a valid folder matching mode.');
    const tree=treeFor(),task={request,cancelled:cancelledFilenameScans.delete(request)},context=activeId;filenameScan=task;let last=0;
    try{const result=await tree.setMatchingMode(mode,{isCancelled:()=>task.cancelled||context!==activeId,onProgress:progress=>{if(Date.now()-last>80){last=Date.now();mainWindow?.webContents.send('folders:matching-progress',{request,...progress});}}});pendingPreview=null;return {...result,pairs:tree.manualAlignment.pairs};}
    catch(error){if(error.code==='ABORT_ERR')return {cancelled:true};throw error;}
    finally{if(filenameScan===task)filenameScan=null;cancelledFilenameScans.delete(request);}
  });
  immediateHandlers.set('folders:read-cancel',(event,value)=>{assertSender(event);const ticket=validateFolderReadTicket(value),context=contexts.get(ticket.sessionId);if(!context)return false;const service=ticket.sessionId===activeId?folders:context.folders,tree=folderTrees.get(service)||(ticket.revision===null?treeFor(service):null);if(!tree||(ticket.revision!==null&&tree.revision!==ticket.revision))return false;return folderReads.cancel(ticket,tree);});
  const runFolderRead=(ticket,tree,revision,work)=>{if(ticket===undefined)return work(undefined);ticket=validateFolderReadTicket(ticket);if(ticket.sessionId!==activeId||ticket.revision!==revision)throw Error('Folder read session changed.');return folderReads.run(ticket,tree,work);};
  handle('folders:tree-list', async (nodeId = 'root', token = null, ticket) => {
    const tree = nodeId === 'root' && token === null ? treeFor() : treeRevision(token);
    if (nodeId !== 'root') rowIds([nodeId]);
    return runFolderRead(ticket,tree,token,async signal=>({...await tree.list(nodeId,{signal}),pairs:tree.manualAlignment.pairs}));
  });
  handle('folders:tree-compare', async (nodeId, token, rules, ticket) => {
    if (nodeId !== 'root') rowIds([nodeId]);
    const tree = treeRevision(token);
    return runFolderRead(ticket,tree,token,async signal=>({...await tree.compare(nodeId,rules,{signal}),pairs:tree.manualAlignment.pairs}));
  });
  handle('folders:tree-compare-selected', async (ids,token,rules,ticket) => {
    rowIds(ids);const tree=treeRevision(token);return runFolderRead(ticket,tree,token,signal=>tree.compareSelected(ids,token,rules,{signal}));
  });
  handle('folders:tree-text-report', async (ids,token,encoding='auto') => {
    const service = folders, tree = treeRevision(token), contextId = activeId;
    const assertActive = () => {
      if (folders !== service || activeId !== contextId || treeFor(service) !== tree || tree.revision !== token) throw Error('Folder session changed. Generate the report again.');
    };
    return readFolderTextReport(service,tree,ids,token,assertActive,encoding);
  });
  handle('folders:tree-refresh-selected', async (ids,token,rules,ticket) => {
    rowIds(ids);const tree=treeRevision(token);return runFolderRead(ticket,tree,token,signal=>tree.refreshSelectedEntries(ids,token,rules,{signal}));
  });
  handle('folders:tree-name-rules', async (rules,token=null) => {
    const tree=token===null?treeFor():treeRevision(token);
    const result=await tree.setNameRules(rules);pendingPreview=null;return result;
  });
  handle('folders:tree-align', async (leftId,rightId,token) => {
    rowIds([leftId]); rowIds([rightId]);
    const tree = treeRevision(token), a = await tree.resolve(leftId,'a',token), b = await tree.resolve(rightId,'b',token);
    if (a.kind !== b.kind) throw new Error('Choose two files or two folders to align.');
    const pairs = tree.manualAlignment.pairs.filter(pair=>pair.a !== a.path && pair.b !== b.path);
    const result = await tree.setAlignment([...pairs,{a:a.path,b:b.path,kind:a.kind}]);
    pendingPreview = null; return result;
  });
  handle('folders:tree-clear-alignment', async token => {
    const result = await treeRevision(token).setAlignment([]); pendingPreview = null; return result;
  });
  const transferRequestId=value=>{if(typeof value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw Error('Invalid transfer request.');return value;};
  immediateHandlers.set('folders:transfer-cancel',(event,id,planId,requestId)=>{
    assertSender(event);if(typeof id!=='string'||!contexts.has(id)||planId!==undefined&&(typeof planId!=='string'||planId.length>200))throw Error('Choose this window’s folder transfer.');
    if(requestId!==undefined)transferRequestId(requestId);
    const task=remoteTransfers.get(id);
    if(task&&(requestId===undefined||task.requestId===requestId)){
      if(planId!==undefined&&task.preview?.id!==planId)return {cancelled:false};
      revokeTransfer(id);return {cancelled:true};
    }
    // An explicit nonce can cancel work still waiting in the global transaction
    // queue without affecting the next unrelated request for this session.
    if(requestId!==undefined){let cancelled=cancelledTransferRequests.get(id);if(!cancelled){cancelled=new Set();cancelledTransferRequests.set(id,cancelled);}cancelled.add(requestId);while(cancelled.size>64)cancelled.delete(cancelled.values().next().value);return {cancelled:true,pending:true};}
    return {cancelled:false};
  });
  const invalidateRenamedTextSources=(task,reason='renamed')=>{
    const connection=task.provider.connection,full=path.posix.join(task.provider.root,task.plan.source);
    for(const [sessionId,record] of remoteChildOrigins)for(const side of ['a','b']){
      const origin=record.sources[side],other=origin?.provider?.connection;if(!origin?.saveToken||!other)continue;
      if(other!==connection&&(!connection.fingerprint||other.fingerprint!==connection.fingerprint))continue;
      if(path.posix.join(origin.provider.root,origin.relative)!==full)continue;
      const saveToken=origin.saveToken;delete origin.saveToken;origin.source={...origin.source,readOnly:true,canSaveToServer:false};delete origin.source.saveToken;remoteTextSaveJobs.get(sessionId)?.abort();
      if(!disposed)mainWindow.webContents.send('text:remote-source-invalidated',{sessionId,side,saveToken,reason});
    }
  };
  handle('folders:tree-preview-rename',async(side,rowId,name,token,requestId)=>{
    sideValue(side);rowIds([rowId]);if(requestId!==undefined){transferRequestId(requestId);if(cancelledTransferRequests.get(activeId)?.delete(requestId))throw Object.assign(Error('Rename cancelled.'),{code:'ABORT_ERR'});}
    if(!activeId||executing)throw Error('Open an idle folder comparison.');
    if(typeof name!=='string'||!name||name.length>255||/[\\/\x00-\x1f\x7f]/.test(name)||['.','..'].includes(name))throw Error('Choose a valid filename without path separators.');
    const endpoint=remoteRoots.get(folders)?.[side];if(!endpoint)throw Error('Choose one regular file on an SFTP side.');
    revokeTransfer(activeId);pendingPreview=null;
    const task={kind:'rename',id:activeId,requestId,owner:folders,tree:treeRevision(token),revision:token,side,provider:endpoint.provider,controller:new AbortController(),phase:'preview'};remoteTransfers.set(task.id,task);
    const signal=task.controller.signal,readEndpoints=Object.values(remoteRoots.get(task.owner)||{});signal.addEventListener('abort',()=>{if(['preview','execute'].includes(task.phase))for(const endpoint of readEndpoints)if(endpoint)void endpoint.provider.connection.close().catch(()=>{});},{once:true});
    task.current=()=>{checkSignal(signal);if(disposed||activeId!==task.id||folders!==task.owner||folderTrees.get(task.owner)!==task.tree||task.tree.revision!==token||remoteTransfers.get(task.id)!==task||remoteRoots.get(task.owner)?.[side]!==endpoint)throw Error('The folder selection changed. Review the rename again.');};
    try{
      const entry=await task.tree.resolve(rowId,side,token);task.current();if(entry.kind!=='file')throw Error('Choose one regular SFTP file to rename.');
      const target=path.posix.join(path.posix.dirname(entry.path),name);
      task.alignment=new FolderAlignment(task.tree.manualAlignment.pairs,endpointKinds(task.owner)).rename(side,entry.path,target);
      task.plan=await prepareSftpRename(task.provider,entry.path,target,{signal});task.current();
      const operation={action:'rename',path:target,sourcePath:entry.path,targetPath:target,sourceSide:side,bytes:task.plan.bytes};
      const preview={id:task.plan.id,remoteTransfer:true,mode:'rename',side,totalBytes:task.plan.bytes,source:entry.path,destination:target,operations:[operation]};task.preview=preview;task.phase='review';
      pendingPreview={id:preview.id,remoteTransfer:true,mode:'rename',preview,transfer:task};return preview;
    }catch(error){if(task.plan)revokeSftpRename(task.plan);if(remoteTransfers.get(task.id)===task)remoteTransfers.delete(task.id);throw error;}
  });
  const recoveryPlatformNotice=process.platform==='win32'?'\nWindows flushes recovery file contents, but this build cannot flush recovery directory entries. Recovery after sudden power loss is not guaranteed.':'';
  const executeRemoteRename=async plan=>{
    const task=plan.transfer,operation=task.preview.operations[0];let submitted=false,verified=false;executing=true;
    const result=(status,extra={})=>({remoteTransfer:true,mode:'rename',side:task.side,completed:status==='completed'?1:0,skipped:0,backupPath:null,items:[{...operation,status}],...extra});
    try{
      task.current();task.phase='confirm';const answer=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Rename remote file?',message:'Apply the reviewed rename?',detail:task.plan.source+'\nNew name: '+task.plan.target+'\n\n'+task.plan.bytes.toLocaleString()+' bytes. A verified local recovery copy is saved before renaming. The destination must remain absent. SFTP cannot prevent a simultaneous external path change.'+recoveryPlatformNotice,buttons:['Cancel','Rename'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return result('unattempted',{cancelled:true,submitted:false,acknowledged:false,renamed:false});task.current();
      task.phase='execute';pendingPreview=null;
      await fs.mkdir(task.owner.backupRoot,{recursive:true,mode:0o700});const stat=await fs.lstat(task.owner.backupRoot);if(!stat.isDirectory()||await fs.realpath(task.owner.backupRoot)!==task.owner.backupRoot)throw Error('The recovery directory changed.');task.current();
      const outcome=await task.tree.withOperation(task.revision,()=>executeSftpRename(task.plan,{backupRoot:task.owner.backupRoot,signal:task.controller.signal}),{drainReads:true,signal:task.controller.signal});submitted=outcome.submitted;verified=true;
      return result('completed',{...outcome,remappedContexts:[{id:task.id,files:{},folders:{},entries:[{side:task.side,oldPath:task.plan.source,newPath:task.plan.target}]}],items:[{...operation,status:'completed',submitted:true,acknowledged:true,renamed:true}]});
    }catch(error){submitted=!!error.submitted;const status=error.code==='RENAME_OUTCOME_UNKNOWN'?'unknown':error.code==='RENAME_VERIFICATION_FAILED'?'verification-failed':submitted?'failed':'unattempted';return result(status,{failed:true,cancelled:task.controller.signal.aborted||error.code==='ABORT_ERR',code:String(error.code||'RENAME_FAILED'),error:String(error.message||error),backupPath:error.backupPath||null,manifestPath:error.manifestPath||null,recoveryDurability:error.recoveryDurability,recoveryWarning:error.recoveryWarning,submitted,acknowledged:!!error.acknowledged,renamed:error.renamed??(status==='unknown'?null:false),items:[{...operation,status,submitted,acknowledged:!!error.acknowledged,renamed:error.renamed??(status==='unknown'?null:false)}]});}
    finally{
      if(submitted)invalidateRenamedTextSources(task);
      revokeSftpRename(task.plan);if(remoteTransfers.get(task.id)===task)remoteTransfers.delete(task.id);if(pendingPreview?.transfer===task)pendingPreview=null;
      if(submitted){task.owner.plans.clear();task.owner.hashCache.clear();if(verified)replaceTree(task.owner,new FolderTree(treeService(task.owner),task.alignment,task.tree.nameRules));else invalidateTree(task.owner);}executing=false;
    }
  };
  const previewRemoteDelete=async(side,ids,token,scope,requestId)=>{
    if(ids.length!==1)throw Error('Choose one regular SFTP file to delete.');
    const rowId=ids[0],rules=validateOperationScope(scope===null?{}:scope);
    sideValue(side);rowIds([rowId]);if(requestId!==undefined){transferRequestId(requestId);if(cancelledTransferRequests.get(activeId)?.delete(requestId))throw Object.assign(Error('Delete cancelled.'),{code:'ABORT_ERR'});}
    if(!activeId||executing)throw Error('Open an idle folder comparison.');
    const endpoint=remoteRoots.get(folders)?.[side];if(!endpoint)throw Error('Choose one regular file on an SFTP side.');
    revokeTransfer(activeId);pendingPreview=null;
    const task={kind:'delete',id:activeId,requestId,owner:folders,tree:treeRevision(token),revision:token,side,provider:endpoint.provider,controller:new AbortController(),phase:'preview'};remoteTransfers.set(task.id,task);
    const signal=task.controller.signal,readEndpoints=Object.values(remoteRoots.get(task.owner)||{});signal.addEventListener('abort',()=>{if(['preview','execute'].includes(task.phase))for(const endpoint of readEndpoints)if(endpoint)void endpoint.provider.connection.close().catch(()=>{});},{once:true});
    task.current=()=>{checkSignal(signal);if(disposed||activeId!==task.id||folders!==task.owner||folderTrees.get(task.owner)!==task.tree||task.tree.revision!==token||remoteTransfers.get(task.id)!==task||remoteRoots.get(task.owner)?.[side]!==endpoint)throw Error('The folder selection changed. Review the delete again.');};
    task.checkScope=async()=>{
      const row=rules.status==='all'?await task.tree.resolveRow(rowId,token):(await task.tree.compareSelected([rowId],token,rules.rules,{signal})).rows[0];task.current();
      if(!filterEntries([row],{...rules,retainDirectories:false}).length)throw Error('The selected file is excluded by the operation filters.');
    };
    try{
      await task.checkScope();
      const entry=await task.tree.resolve(rowId,side,token);task.current();if(entry.kind!=='file')throw Error('Choose one regular SFTP file to delete.');
      task.plan=await prepareSftpDelete(task.provider,entry.path,{signal});task.current();
      const operation={action:'delete',path:entry.path,sourcePath:entry.path,sourceSide:side,bytes:task.plan.bytes};
      const preview={id:task.plan.id,remoteTransfer:true,mode:'delete',side,operationScope:rules,totalBytes:task.plan.bytes,source:entry.path,operations:[operation]};task.preview=preview;task.phase='review';
      pendingPreview={id:preview.id,remoteTransfer:true,mode:'delete',preview,transfer:task};return preview;
    }catch(error){if(task.plan)revokeSftpDelete(task.plan);if(remoteTransfers.get(task.id)===task)remoteTransfers.delete(task.id);throw error;}
  };
  const executeRemoteDelete=async plan=>{
    const task=plan.transfer,operation=task.preview.operations[0];let submitted=false;executing=true;
    const result=(status,extra={})=>({remoteTransfer:true,mode:'delete',side:task.side,completed:status==='completed'?1:0,skipped:0,backupPath:null,items:[{...operation,status}],...extra});
    try{
      task.current();task.phase='confirm';const answer=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Delete remote file?',message:'Apply the reviewed delete?',detail:task.plan.source+'\n\n'+task.plan.bytes.toLocaleString()+' bytes. A verified local recovery copy is saved before deletion. SFTP cannot prevent a simultaneous external path change.'+recoveryPlatformNotice,buttons:['Cancel','Delete'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return result('unattempted',{cancelled:true,submitted:false,acknowledged:false,deleted:false});task.current();
      task.phase='execute';pendingPreview=null;await task.checkScope();task.current();
      await fs.mkdir(task.owner.backupRoot,{recursive:true,mode:0o700});const stat=await fs.lstat(task.owner.backupRoot);if(!stat.isDirectory()||await fs.realpath(task.owner.backupRoot)!==task.owner.backupRoot)throw Error('The recovery directory changed.');task.current();
      const outcome=await task.tree.withOperation(task.revision,()=>executeSftpDelete(task.plan,{backupRoot:task.owner.backupRoot,signal:task.controller.signal}),{drainReads:true,signal:task.controller.signal});submitted=outcome.submitted;
      return result('completed',{...outcome,items:[{...operation,status:'completed',submitted:true,acknowledged:true,deleted:true}]});
    }catch(error){submitted=!!error.submitted;const status=error.code==='DELETE_OUTCOME_UNKNOWN'?'unknown':error.code==='DELETE_VERIFICATION_FAILED'?'verification-failed':submitted?'failed':'unattempted';return result(status,{failed:true,cancelled:task.controller.signal.aborted||error.code==='ABORT_ERR',code:String(error.code||'DELETE_FAILED'),error:String(error.message||error),backupPath:error.backupPath||null,manifestPath:error.manifestPath||null,recoveryDurability:error.recoveryDurability,recoveryWarning:error.recoveryWarning,submitted,acknowledged:!!error.acknowledged,deleted:error.deleted??(status==='unknown'?null:false),items:[{...operation,status,submitted,acknowledged:!!error.acknowledged,deleted:error.deleted??(status==='unknown'?null:false)}]});}
    finally{
      if(submitted)invalidateRenamedTextSources(task,'deleted');
      revokeSftpDelete(task.plan);if(remoteTransfers.get(task.id)===task)remoteTransfers.delete(task.id);if(pendingPreview?.transfer===task)pendingPreview=null;
      if(submitted){task.owner.plans.clear();task.owner.hashCache.clear();invalidateTree(task.owner);}executing=false;
    }
  };
  const previewRemoteCopy=async(side,ids,token,scope,requestId)=>{
    if(requestId!==undefined){transferRequestId(requestId);if(cancelledTransferRequests.get(activeId)?.delete(requestId))throw Object.assign(Error('Folder transfer cancelled.'),{code:'ABORT_ERR'});}
    if(!activeId||executing)throw Error('Open an idle folder comparison.');
    if(ids.length>1000)throw Error('Select at most 1000 files or folders.');
    revokeTransfer(activeId);pendingPreview=null;
    const id=activeId,owner=folders,tree=treeRevision(token),targetSide=side==='a'?'b':'a',providerService=treeService(owner),endpoints={...remoteRoots.get(owner)},rules=validateOperationScope(scope||{});
    const source=providerService.endpoint(side),destination=providerService.endpoint(targetSide),task={id,requestId,owner,tree,revision:token,controller:new AbortController(),phase:'preview'};remoteTransfers.set(id,task);
    const signal=task.controller.signal;
    signal.addEventListener('abort',()=>{if(task.phase==='preview'||task.phase==='execute')for(const endpoint of Object.values(endpoints))if(endpoint)void endpoint.provider.connection.close().catch(()=>{});},{once:true});
    const current=()=>{checkSignal(signal);if(disposed||activeId!==id||folders!==owner||folderTrees.get(owner)!==tree||tree.revision!==token||remoteTransfers.get(id)!==task)throw Error('The folder selection changed. Preview again.');};task.current=current;
    try{
      const selections=[];
      for(const rowId of ids){const row=await tree.resolveRow(rowId,token);current();const kind=row[side==='a'?'kindA':'kindB'],relative=row[side==='a'?'pathA':'pathB'];if(!['file','directory'].includes(kind)||typeof relative!=='string')throw Error('Select files or folders on the source side.');selections.push(relative);}
      const endpointKinds={a:endpoints.a?'remote':'local',b:endpoints.b?'remote':'local'};
      task.plan=await prepareRecursiveProviderCopy(providerService,side,selections,{scope:rules,alignment:tree.alignment,endpointKinds,signal});current();
      if(!task.plan.operations.length)throw Error('No selected files or folders match the current file-action scope.');
      if(endpoints[targetSide]&&destination.connection.capabilities?.atomicRename!==true&&task.plan.operations.some(op=>op.action==='copy'&&op.overwrite))throw Error('This server cannot atomically replace existing files. Select new destinations or use a local copy.');
      const label=s=>{const endpoint=endpoints[s];return endpoint?'sftp://'+(endpoint.descriptor.host.includes(':')?'['+endpoint.descriptor.host+']':endpoint.descriptor.host)+':'+endpoint.descriptor.port+endpoint.provider.root:owner.roots[s];};
      const operations=task.plan.operations.filter(op=>op.action!=='skip').map(op=>({...op,path:op.target,sourcePath:op.source,targetPath:op.target,sourceSide:side}));
      const preview={id:task.plan.id,remoteTransfer:true,recursive:true,mode:'copy',direction:side==='a'?'a-to-b':'b-to-a',source:label(side),destination:label(targetSide),operationScope:rules,skipped:task.plan.operations.filter(op=>op.action==='skip').length,excluded:null,totalBytes:task.plan.totalBytes,operations,filesToCopy:operations.filter(op=>op.action==='copy').length,directoriesToCreate:operations.filter(op=>op.action==='create-directory').length,directoriesToFinalize:operations.filter(op=>op.action==='finalize-directory').length,coverage:task.plan.coverage};
      task.preview=preview;task.phase='review';task.source=source;task.destination=destination;task.targetSide=targetSide;task.remoteDestination=!!endpoints[targetSide];
      pendingPreview={id:preview.id,remoteTransfer:true,mode:'copy',direction:preview.direction,preview,transfer:task};return preview;
    }catch(error){if(task.plan)revokeRecursiveProviderCopy(task.plan);if(remoteTransfers.get(id)===task)remoteTransfers.delete(id);throw error;}
  };
  const executeRemoteCopy=async(plan)=>{
    const task=plan.transfer,empty=()=>({completed:0,skipped:0,backupPath:null,items:task.plan.operations.map(op=>({...op,status:'unattempted'}))});
    let started=false;executing=true;
    try{
      task.current();task.phase='confirm';
      const answer=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Copy selected files and folders?',message:'Apply the reviewed copy?',detail:task.preview.source+'\n→ '+task.preview.destination+'\n\n'+task.preview.filesToCopy+' files will be copied, '+task.preview.directoriesToCreate+' folders created, and '+task.preview.skipped+' identical files skipped. The review includes matching descendants inside collapsed folders. Existing files are backed up locally before replacement.'+(task.preview.operations.some(op=>op.overwrite)?recoveryPlatformNotice:''),buttons:['Cancel','Copy'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return {remoteTransfer:true,recursive:true,cancelled:true,...empty()};task.current();
      task.phase='execute';pendingPreview=null;started=true;
      if(task.preview.operations.some(op=>op.overwrite)){await fs.mkdir(task.owner.backupRoot,{recursive:true,mode:0o700});const backupStat=await fs.lstat(task.owner.backupRoot);if(!backupStat.isDirectory()||await fs.realpath(task.owner.backupRoot)!==task.owner.backupRoot)throw Error('The recovery directory changed. Choose a regular local recovery folder.');task.current();}
      const assertTransfer=()=>{checkSignal(task.controller.signal);if(remoteTransfers.get(task.id)!==task||folders!==task.owner||activeId!==task.id)throw Error('The transfer session changed.');};
      const outcome=await task.tree.withOperation(task.revision,()=>executeRecursiveProviderCopy(task.plan,{backupRoot:task.owner.backupRoot,signal:task.controller.signal,writeFile:request=>{
        assertTransfer();
        return task.remoteDestination?transferFileToSftp(request.source,request.sourcePath,request.sourceObservation,request.destination,request.targetPath,request.targetObservation,{signal:request.signal}):transferFileToLocal(request.source,request.sourcePath,request.sourceObservation,task.owner,task.targetSide,request.targetPath,request.targetObservation,{signal:request.signal});
      },prepareDirectory:request=>{assertTransfer();return task.remoteDestination?prepareSftpDirectory(request.destination,request.targetPath,{signal:request.signal}):prepareLocalDirectory(task.owner,task.targetSide,request.targetPath,{signal:request.signal});},createDirectory:request=>{assertTransfer();return task.remoteDestination?createSftpDirectory(request.prepared,{signal:request.signal}):createLocalDirectory(request.prepared,{signal:request.signal});},finalizeDirectory:request=>{assertTransfer();return task.remoteDestination?finalizeSftpDirectory(request.created,request.sourceMetadata,request.expectedChildren,{signal:request.signal}):finalizeLocalDirectory(request.created,request.sourceMetadata,request.expectedChildren,{signal:request.signal});},onProgress:progress=>{if(!disposed)mainWindow.webContents.send('folders:transfer-progress',{sessionId:task.id,planId:task.preview.id,...progress});}}),{drainReads:true,signal:task.controller.signal});
      return {remoteTransfer:true,recursive:true,...outcome};
    }catch(error){return {remoteTransfer:true,recursive:true,failed:true,cancelled:task.controller.signal.aborted||error.code==='ABORT_ERR',code:String(error.code||'TRANSFER_FAILED'),error:String(error.message||error),...(error.outcome||{...empty(),backupPath:error.backupPath||null})};}
    finally{
      if(task.plan)revokeRecursiveProviderCopy(task.plan);if(remoteTransfers.get(task.id)===task)remoteTransfers.delete(task.id);if(pendingPreview?.transfer===task)pendingPreview=null;
      if(started){task.owner.plans.clear();task.owner.hashCache.clear();invalidateTree(task.owner);}executing=false;
    }
  };
  handle('folders:tree-preview-action', async (action,side,ids,token,scope=null,requestId) => {
    sideValue(side); rowIds(ids);
    if (!['copy','move','delete'].includes(action)) throw new Error('Choose copy, move or delete.');
    if(hasRemote()){if(action==='delete')return previewRemoteDelete(side,ids,token,scope,requestId);if(action==='copy')return previewRemoteCopy(side,ids,token,scope,requestId);throw Error('Move is not available for SFTP folders.');}
    const tree = treeRevision(token), paths = [];
    for (const id of ids) paths.push((await tree.resolve(id,side,token)).path);
    pendingPreview = null;
    const activeFolders = folders;
    let service,preview;
    if(scope!==null&&action==='delete')({service,preview}=await previewFilteredDelete(folders,tree,side,paths,scope));
    else if(scope!==null&&action==='move'){
      const staged=await previewFilteredMove(folders,tree,side,paths,scope);
      service={execute:id=>tree.withOperation(token,()=>staged.service.execute(id))};
      preview={...staged.preview,source:staged.source,destination:staged.destination};
    }else{
      service=action==='delete'?{execute:id=>tree.withOperation(token,()=>activeFolders.execute(id))}:new MappedFolderOperations(folders,tree);
      preview=action==='delete'?await folders.previewAction('delete',side,paths):action==='move'?await service.previewMove(side,paths):await service.previewCopy(side,paths,scope);
    }
    if(scope!==null)preview={...preview,operationScope:scope};
    pendingPreview = {id:preview.id,mode:action,direction:preview.direction,side,preview,service,source:preview.source,destination:preview.destination};
    return preview;
  });
  handle('folders:tree-update-both', async (ids,token,scope=null,direction='both') => {
    if(executing)throw new Error('Wait for the current folder operation to finish.');
    const tree=treeRevision(token),rows=[];
    for(const id of rowIds(ids))rows.push(await tree.resolveRow(id,token));
    pendingPreview=null;
    const service=new UpdateBothOperations(folders,tree),preview=await service.preview(rows,scope,direction);
    pendingPreview={id:preview.id,mode:preview.mode,direction:preview.direction,preview,service};
    return preview;
  });
  handle('folders:tree-preview', async (mode,direction,ids,token,scope=null,subtrees=false) => {
    if (!['merge','sync'].includes(mode) || !['a-to-b','b-to-a'].includes(direction)) throw new Error('Choose a valid folder operation.');
    const tree = treeRevision(token), source = direction === 'a-to-b' ? 'a' : 'b', paths = ids === null ? null : [];
    if (ids !== null) for (const id of rowIds(ids)) {
      const row = await tree.resolveRow(id,token), actualSource = row[source === 'a' ? 'pathA' : 'pathB'];
      const target = row[source === 'a' ? 'pathB' : 'pathA'] ?? (actualSource === null ? null : tree.alignment.counterpart(source,actualSource));
      if (target === null) throw new Error('A selected entry has no available mapped destination.');
      paths.push(target);
    }
    pendingPreview = null;
    const service = new MappedFolderOperations(folders,tree), preview = await service.preview(mode,direction,paths,scope,subtrees);
    pendingPreview = {id:preview.id,mode,direction,preview,service}; return preview;
  });
  const resolveTreePaths = async (side,ids,token) => {
    sideValue(side); rowIds(ids); const tree = treeRevision(token), paths = [];
    for (const id of ids) paths.push((await tree.resolve(id,side,token)).path);
    return {tree,paths};
  };
  const openTreeRow = async (id,token,binary,encoding='auto') => {
    if(hasRemote())throw Error('The folder session changed. Open the remote file again.');
    const current=openOwner(),service=folders,checkScope=await folderOpenScope(service);
    const encodings=require('./folder-rules.cjs').validateFolderTextEncodings(encoding);
    rowIds([id]);const tree=treeRevision(token),row=await tree.resolveRow(id,token),relatives={};
    for(const side of ['a','b'])relatives[side]=row[side==='a'?'kindA':'kindB']==='file'?row[side==='a'?'pathA':'pathB']:null;
    const staged=await stageFolderFiles(service,relatives,binary,encodings);
    await tree.resolveRow(id,token);await checkScope();await staged.validate();current();
    if(folderTrees.get(service)!==tree||tree.revision!==token)throw Error('The folder comparison changed while opening.');
    const authorities=binary?snapshotAuthorities(staged.values,staged.snapshots):new Map();
    const child=createContext();dataAuthorities=authorities;
    if(!binary)for(const side of ['a','b'])if(staged.stages[side])commitLoaded(side,staged.stages[side]);
    return {id:child.id,...staged.values};
  };
  const openRemoteTreeChild=(ids,token,mode,encoding,ticket)=>{
    if(disposed||!hasRemote()||!activeId||sftpBlocked.has(activeId))throw Error('The remote folder session changed.');
    for(const id of ids)rowIds([id]);const parentId=activeId,service=folders,tree=treeRevision(token),generation=activationGeneration,providerService=treeService(service),endpoints={...remoteRoots.get(service)};
    const stage=async externalSignal=>{
      if(remoteChildJobs.get(service)?.size)throw Error('Wait for the current remote comparison to finish opening.');
      const controller=new AbortController(),abort=()=>controller.abort();externalSignal?.addEventListener('abort',abort,{once:true});if(externalSignal?.aborted)abort();
      let jobs=remoteChildJobs.get(service);if(!jobs){jobs=new Set();remoteChildJobs.set(service,jobs);}jobs.add(controller);
      // Tree row resolution currently has no signal argument. Closing the owned
      // transport also cancels metadata requests made before the staged reader.
      const abortTransports=()=>{for(const endpoint of Object.values(endpoints))if(endpoint)void endpoint.provider.connection.close().catch(()=>{});};
      controller.signal.addEventListener('abort',abortTransports,{once:true});if(controller.signal.aborted)abortTransports();
      const current=()=>{
        if(controller.signal.aborted)throw Object.assign(Error('Opening remote files was cancelled.'),{code:'ABORT_ERR'});
        if(disposed||executing||activeId!==parentId||activationGeneration!==generation||!contexts.has(parentId)||folders!==service||folderTrees.get(service)!==tree||tree.revision!==token||sftpBlocked.has(parentId))throw Error('The folder session changed while opening files.');
      };
      try {
        current();let relatives;
        if(ids.length===2){
          const a=await tree.resolve(ids[0],'a',token);current();const b=await tree.resolve(ids[1],'b',token);current();
          if(a.kind!==b.kind||!['file','directory'].includes(a.kind))throw Error('Choose two files or two folders to compare.');relatives={a:a.path,b:b.path};
          if(a.kind==='directory'){
            const childService=createFolderService(service.backupRoot),childEndpoints={},descriptors={},observations={};
            for(const side of ['a','b']){
              observations[side]=await providerService.inspectEntry(side,relatives[side],{signal:controller.signal});current();
              if(observations[side]?.kind!=='directory')throw Error('A selected folder changed. Select the pair again.');
              const endpoint=endpoints[side];
              if(endpoint){
                const provider=await SftpFolderProvider.create(endpoint.provider.connection,path.posix.join(endpoint.provider.root,relatives[side]),{signal:controller.signal});current();
                const descriptor={...endpoint.descriptor,name:path.posix.basename(provider.root)||provider.root,path:provider.root};
                childEndpoints[side]={provider,descriptor};descriptors[side]=descriptor;
              }else{descriptors[side]=await childService.select(side,await service.safe(side,relatives[side]));current();}
            }
            for(const side of ['a','b']){
              const after=await providerService.inspectEntry(side,relatives[side],{signal:controller.signal});current();
              if(!after||after.identity!==observations[side].identity||after.stamp!==observations[side].stamp)throw Error('A selected folder changed while opening. Select the pair again.');
            }
            await tree.resolve(ids[0],'a',token);await tree.resolve(ids[1],'b',token);current();
            return await scheduleCommit(()=>{
              current();const parentEntry=sftpSession(parentId),entry={owner:{},reviews:new Map(),attachments:new Map()};
              try{
                for(const side of ['a','b'])if(childEndpoints[side]){
                  const metadata=sftpRegistry.retainConnection(parentEntry.owner,endpoints[side].descriptor.connectionId,entry.owner);
                  childEndpoints[side].descriptor={...childEndpoints[side].descriptor,connectionId:metadata.connectionId};descriptors[side]=childEndpoints[side].descriptor;
                }
              }catch(error){void sftpRegistry.disposeSession(entry.owner);throw error;}
              jobs.delete(controller);const child=createContext();folders=childService;remoteRoots.set(childService,childEndpoints);sftpSessions.set(child.id,entry);rememberContext();
              return {id:child.id,mode:'folder-compare',name:descriptors.a.name+' ↔ '+descriptors.b.name,remote:true,folders:descriptors};
            });
          }
        }else{
          const row=await tree.resolveRow(ids[0],token);current();relatives={};
          for(const side of ['a','b']){const suffix=side==='a'?'A':'B',relative=row['path'+suffix];if(relative&&row['kind'+suffix]!=='file')throw Error('Choose a regular file row to open.');relatives[side]=relative||null;}
        }
        const staged=await stageProviderFolderOpen(providerService,relatives,{mode,encoding,signal:controller.signal,extractPdfText,extractDocText});current();
        if(ids.length===2){await tree.resolve(ids[0],'a',token);await tree.resolve(ids[1],'b',token);}else await tree.resolveRow(ids[0],token);
        current();
        const values={},origins={};
        for(const side of ['a','b']){
          const value=staged[side];if(!value){values[side]=null;continue;}const endpoint=endpoints[side],relative=relatives[side];
          const host=endpoint?.descriptor.host,remoteHost=host?.includes(':')?'['+host+']':host;
          const displayPath=endpoint?'sftp://'+remoteHost+':'+endpoint.descriptor.port+path.posix.join(endpoint.provider.root,relative):path.join(service.roots[side],...relative.split('/'));
          const source={protocol:endpoint?'sftp':'file',displayPath,readOnly:true,...(endpoint?{host:endpoint.descriptor.host,port:endpoint.descriptor.port}:{})};
          values[side]={...value,path:'',source};origins[side]={source,relative,observation:staged.observations[side],...(endpoint?{connectionId:endpoint.descriptor.connectionId,provider:endpoint.provider}:{})};
        }
        // Network staging stays cancellable. Publication waits for prior native
        // transactions, then checks authority and creates the child without any
        // further await. Background reads do not spuriously reject this commit.
        return await scheduleCommit(()=>{
          current();let entry;
          if(staged.mode==='text-compare'){
            const parentEntry=sftpSession(parentId);entry={owner:{},reviews:new Map(),attachments:new Map()};
            try{
              for(const side of ['a','b'])if(origins[side]?.provider){
                const original=origins[side].provider,metadata=sftpRegistry.retainConnection(parentEntry.owner,origins[side].connectionId,entry.owner);
                // The text child owns a lease and its own revocation state. Preserve
                // the staged namespace so raw-byte observations remain comparable.
                const provider=new SftpFolderProvider(original.connection,original.root,{maxEntries:original.maxEntries,maxBatches:original.maxBatches});
                provider.rootId=original.rootId;provider.namespace=original.namespace;
                const eligible=!values[side].documentProjection&&original.connection.capabilities?.atomicRename===true,saveToken=eligible?randomUUID():undefined;
                const source=eligible?{...origins[side].source,canSaveToServer:true,readOnly:false,saveToken}:origins[side].source;
                values[side].source=source;origins[side]={...origins[side],source,connectionId:metadata.connectionId,provider,...(eligible?{saveToken}:{})};
              }
            }catch(error){void sftpRegistry.disposeSession(entry.owner);throw error;}
          }
          jobs.delete(controller);const child=createContext();if(entry)sftpSessions.set(child.id,entry);remoteChildOrigins.set(child.id,{parentSessionId:parentId,sources:origins});
          if(staged.mode==='text-compare')for(const side of ['a','b'])if(values[side]){textFormats[side]=values[side].format;textInputEncodings[side]=values[side].format.encoding;if(values[side].documentProjection)textProjections[side]=values[side].documentProjection;}
          return {id:child.id,mode:staged.mode,name:staged.name,remote:true,...values};
        });
      }finally{
        externalSignal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',abortTransports);jobs.delete(controller);if(!jobs.size)remoteChildJobs.delete(service);
      }
    };
    return runFolderRead(ticket,tree,token,stage);
  };
  immediateHandlers.set('folders:tree-open-files',(event,id,token,encoding='auto',ticket)=>{assertSender(event);return openRemoteTreeChild([id],token,'text',encoding,ticket);});
  immediateHandlers.set('folders:tree-open-data',(event,id,token,ticket)=>{assertSender(event);return openRemoteTreeChild([id],token,'data','auto',ticket);});
  immediateHandlers.set('folders:tree-open-pair',(event,leftId,rightId,token,encoding='auto',ticket)=>{assertSender(event);return openRemoteTreeChild([leftId,rightId],token,'auto',encoding,ticket);});
  handle('folders:tree-open-files',(id,token,encoding)=>openTreeRow(id,token,false,encoding));
  handle('folders:tree-open-data',(id,token)=>openTreeRow(id,token,true));
  handle('folders:tree-open-pair',async (leftId,rightId,token,encoding='auto')=>{
    if(hasRemote())throw Error('The folder session changed. Open the remote pair again.');
    const tree = treeRevision(token); rowIds([leftId]); rowIds([rightId]);
    const a = await tree.resolve(leftId,'a',token), b = await tree.resolve(rightId,'b',token);
    return openFolderPair(a.path,b.path,encoding);
  });
  handle('folders:tree-rename',async (side,id,name,token)=>{
    sideValue(side);if(remoteRoots.get(folders)?.[side]||pendingRemoteRoots.get(folders)?.[side]||!folders.roots[side])throw Error('Use the reviewed rename for an SFTP file.');
    const {paths} = await resolveTreePaths(side,[id],token);
    return renameFolderEntry(side,paths[0],name);
  });
  handle('folders:tree-reveal',async (side,id,token)=>{
    const {tree,paths} = await resolveTreePaths(side,[id],token), file = await folders.safe(side,paths[0]);
    await tree.resolve(id,side,token); shell.showItemInFolder(file); return true;
  });
  handle('folders:tree-copy-paths',async (side,ids,token,format='absolute')=>{
    if(!['absolute','relative','name'].includes(format))throw Error('Invalid clipboard path format.');
    const service=folders,sessionId=activeId,endpoint=remoteRoots.get(service)?.[side];
    const {tree,paths} = await resolveTreePaths(side,ids,token), files = [];
    for (const relative of paths) {
      if(endpoint){
        const host=endpoint.descriptor.host,authority=(host.includes(':')?'['+host+']':host)+':'+endpoint.descriptor.port;
        const full=path.posix.join(endpoint.provider.root,relative);
        files.push('sftp://'+authority+full.split('/').map(encodeURIComponent).join('/'));
      }else files.push(await service.safe(side,relative));
    }
    for (const id of ids) await tree.resolve(id,side,token);
    if(activeId!==sessionId||folders!==service||folderTrees.get(service)!==tree||remoteRoots.get(service)?.[side]!==endpoint)throw Error('The folder changed before copying paths.');
    clipboard.writeText((format==='name'?paths.map(file=>path.posix.basename(file)):format==='relative'?paths:files).join('\n')); return true;
  });
  const sizeLease=(service,tree,side,ids,revision)=>{
    folderSizeRequest?.controller.abort();
    const endpoint=remoteRoots.get(service)?.[side];
    return folderSizeRequest={token:randomUUID(),controller:new AbortController(),owner:service,sessionId:activeId,generation:activationGeneration,tree,side,ids:new Set(ids),revision,endpoint,root:service.roots[side],provider:endpoint?.provider||localFolderEndpoint(service,side),remoteProviders:Object.values(remoteRoots.get(service)||{}).map(value=>value.provider),running:new Set()};
  };
  const currentSizeLease=(request,side,id,revision,requestToken)=>{
    if(!request||request!==folderSizeRequest||typeof requestToken!=='string'||request.token!==requestToken||request.controller.signal.aborted||disposed||activeId!==request.sessionId||activationGeneration!==request.generation||folders!==request.owner||folderTrees.get(request.owner)!==request.tree||request.tree.revision!==request.revision||side!==request.side||revision!==request.revision||!request.ids.has(id)||remoteRoots.get(request.owner)?.[side]!==request.endpoint||request.owner.roots[side]!==request.root)throw Error('Open Properties again before calculating folder size.');
  };
  immediateHandlers.set('folders:cancel-size',(event,requestToken)=>{
    assertSender(event);
    if(typeof requestToken!=='string'||requestToken!==folderSizeRequest?.token||folderSizeRequest.sessionId!==activeId||folderSizeRequest.owner!==folders)return false;
    folderSizeRequest.controller.abort();return true;
  });
  handle('folders:tree-size',async(side,id,token,requestToken)=>{
    sideValue(side);rowIds([id]);const request=folderSizeRequest;currentSizeLease(request,side,id,token,requestToken);
    const {tree,paths}=await resolveTreePaths(side,[id],token);currentSizeLease(request,side,id,token,requestToken);
    const result=await readFolderSize((...args)=>request.owner.safe(...args),side,paths[0],{signal:request.controller.signal});
    await tree.resolve(id,side,token);currentSizeLease(request,side,id,token,requestToken);return result;
  });
  immediateHandlers.set('folders:tree-size',async(event,side,id,token,requestToken)=>{
    assertSender(event);sideValue(side);rowIds([id]);const request=folderSizeRequest;currentSizeLease(request,side,id,token,requestToken);
    if(request.running.has(id))throw Error('This folder size is already being calculated.');request.running.add(id);
    const controller=new AbortController(),abort=()=>controller.abort();request.controller.signal.addEventListener('abort',abort,{once:true});if(request.controller.signal.aborted)abort();
    let jobs=remoteChildJobs.get(request.owner);if(!jobs){jobs=new Set();remoteChildJobs.set(request.owner,jobs);}jobs.add(controller);
    const deadline=Date.now()+10000;let resolving=true,resolutionTimedOut=false,result;
    const closeTransport=()=>{for(const provider of resolving?request.remoteProviders:request.endpoint?[request.endpoint.provider]:[])void provider.connection.close().catch(()=>{});};controller.signal.addEventListener('abort',closeTransport,{once:true});
    const current=()=>{checkSignal(controller.signal);currentSizeLease(request,side,id,token,requestToken);};
    const boundedResolve=async()=>{
      resolving=true;let timer,listener;
      const timeoutError=Object.assign(Error('Folder size calculation timed out. Reconnect and try again.'),{code:'FOLDER_SIZE_TIMEOUT'});
      const stopped=new Promise((_,reject)=>{
        listener=()=>reject(resolutionTimedOut?timeoutError:Object.assign(Error('Folder size calculation cancelled.'),{code:'ABORT_ERR'}));controller.signal.addEventListener('abort',listener,{once:true});
        timer=setTimeout(()=>{resolutionTimedOut=true;controller.abort();},Math.max(1,deadline-Date.now()));
      });
      try{return await Promise.race([request.tree.resolve(id,side,token),stopped]);}
      finally{clearTimeout(timer);controller.signal.removeEventListener('abort',listener);}
    };
    try{
      current();const entry=await boundedResolve();current();resolving=false;
      result=await readProviderFolderSize(request.provider,entry.path,{signal:controller.signal,maxDurationMs:Math.max(1,deadline-Date.now())});current();
      // A deadline closes the remote transport. Preserve the explicitly partial
      // total using the lease guard; do not start another request on that socket.
      if(result.timedOut||result.limitReason==='time')return result;
      await boundedResolve();current();return result;
    }catch(error){
      if(resolutionTimedOut&&result&&!request.controller.signal.aborted){currentSizeLease(request,side,id,token,requestToken);return {...result,limited:true,complete:false,timedOut:true};}
      throw error;
    }finally{request.controller.signal.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',closeTransport);request.running.delete(id);jobs.delete(controller);if(!jobs.size)remoteChildJobs.delete(request.owner);}
  });
  immediateHandlers.set('folders:tree-properties',(event,side,ids,token,ticket)=>{
    assertSender(event);sideValue(side);rowIds(ids);if(ids.length>1000)throw Error('Select between 1 and 1000 files or folders.');
    const tree=treeRevision(token),service=folders,sessionId=activeId,generation=activationGeneration,endpoint=remoteRoots.get(service)?.[side];
    folderSizeRequest?.controller.abort();folderSizeRequest=null;
    return runFolderRead(ticket,tree,token,async signal=>{
      const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      let jobs=remoteChildJobs.get(service);if(!jobs){jobs=new Set();remoteChildJobs.set(service,jobs);}jobs.add(controller);
      const closeTransport=()=>{if(endpoint)void endpoint.provider.connection.close().catch(()=>{});};controller.signal.addEventListener('abort',closeTransport,{once:true});
      const current=()=>{if(controller.signal.aborted)throw Object.assign(Error('Reading properties was cancelled.'),{code:'ABORT_ERR'});if(disposed||activeId!==sessionId||activationGeneration!==generation||folders!==service||folderTrees.get(service)!==tree||tree.revision!==token)throw Error('The folder changed while reading properties.');};
      try{
        current();const paths=[];for(const id of ids){paths.push((await tree.resolve(id,side,token)).path);current();}
        const host=endpoint?.descriptor.host,displayHost=host?.includes(':')?'['+host+']':host;
        const result=endpoint?await readProviderFolderProperties(treeService(service),side,paths,{signal:controller.signal,displayPath:relative=>'sftp://'+displayHost+':'+endpoint.descriptor.port+path.posix.join(endpoint.provider.root,relative).split('/').map(encodeURIComponent).join('/')}):await readFolderProperties((...args)=>service.safe(...args),side,paths);
        current();for(const id of ids){await tree.resolve(id,side,token);current();}
        const lease=sizeLease(service,tree,side,ids,token);return {...result,remote:!!endpoint,canCalculateSize:true,sizeRequestToken:lease.token};
      }finally{signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',closeTransport);jobs.delete(controller);if(!jobs.size)remoteChildJobs.delete(service);}
    });
  });
  handle('folders:tree-properties',async (side,ids,token)=>{
    if(!Array.isArray(ids)||ids.length>1000)throw new Error('Select between 1 and 1000 files or folders.');
    folderSizeRequest?.controller.abort();folderSizeRequest=null;
    const {tree,paths} = await resolveTreePaths(side,ids,token), activeFolders = folders;
    const result=await readFolderProperties((...args)=>activeFolders.safe(...args),side,paths);
    for(const id of ids)await tree.resolve(id,side,token);
    const lease=sizeLease(activeFolders,tree,side,ids,token);
    return {...result,canCalculateSize:true,sizeRequestToken:lease.token};
  });
  handle('folders:tree-attributes-preview',async(side,ids,token)=>{
    if(!activeId||!contexts.has(activeId))throw Error('Open a folder comparison first.');
    if(!Array.isArray(ids)||!ids.length||ids.length>1000)throw Error('Select between 1 and 1000 files or folders.');
    attributePlans.delete(activeId);
    const {tree,paths}=await resolveTreePaths(side,ids,token),owner=folders,root=await owner.directoryPath(side);
    const preview=await previewFolderAttributes((...args)=>owner.safe(...args),side,paths);
    for(const id of ids)await tree.resolve(id,side,token);
    const id=randomUUID();attributePlans.set(activeId,{id,owner,root,side,ids:[...ids],paths,tree,revision:token,preview});
    return {id,root,platform:preview.platform,entries:preview.entries.map(({path,mode,attributes})=>({path,mode,attributes}))};
  });
  handle('folders:tree-attributes-cancel',id=>{if(typeof id!=='string'||id.length>200)throw Error('Invalid attribute preview.');for(const [context,plan]of attributePlans)if(plan.id===id)attributePlans.delete(context);return {cancelled:true};});
  handle('folders:tree-attributes-execute',async(id,changes)=>{
    const context=activeId,plan=attributePlans.get(context);
    if(typeof id!=='string'||!plan||plan.id!==id)throw Error('Preview these attributes again.');
    if(plan.owner!==folders||folders.roots[plan.side]!==plan.root){attributePlans.delete(context);throw Error('Folder changed. Preview these attributes again.');}
    validateAttributeChanges(changes,plan.preview.platform);
    if(executing)throw Error('A folder operation is already running.');executing=true;
    try{
      await plan.tree.checkRevision(plan.revision);
      const answer=await dialog.showMessageBox(mainWindow,{type:'warning',title:'Change file attributes?',message:'Change attributes for '+plan.paths.length+' selected entries?',detail:plan.root+'\n\nOnly selected entries are changed. Folder contents are not changed recursively. Removing permissions can prevent access to selected files or folders.',buttons:['Cancel','Apply attributes'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return {cancelled:true};
      attributePlans.delete(context);pendingPreview=null;
      for(const id of plan.ids)await plan.tree.resolve(id,plan.side,plan.revision);
      try{return await plan.tree.withOperation(plan.revision,()=>setFolderAttributes((...args)=>plan.owner.safe(...args),plan.side,plan.paths,changes,plan.preview.entries));}
      finally{plan.owner.plans.clear();plan.owner.hashCache.clear();invalidateTree(plan.owner);}
    }catch(error){attributePlans.delete(context);throw error;}finally{executing=false;}
  });
  handle('folders:tree-set-modified',async (side,ids,modifiedMs,token)=>{
    const {tree,paths} = await resolveTreePaths(side,ids,token), activeFolders = folders;
    pendingPreview = null;
    try { return await tree.withOperation(token,()=>setFolderModified((...args)=>activeFolders.safe(...args),side,paths,modifiedMs)); }
    finally { activeFolders.plans.clear(); activeFolders.hashCache.clear(); }
  });
  handle('folders:tree-create',async (kind,side,parentId,name,token,parentOf=false)=>{
    if (typeof parentOf !== 'boolean' || parentId === 'root' && parentOf) throw new Error('Choose a valid parent folder.');
    sideValue(side); if (!['file','directory'].includes(kind)) throw new Error('Choose a file or folder.');
    const tree = treeRevision(token); await tree.checkRevision(token); let parent = '';
    if (parentId !== 'root') {
      rowIds([parentId]); const entry = await tree.resolve(parentId,side,token);
      if (!parentOf && entry.kind !== 'directory') throw new Error('Choose a parent folder.');
      parent = parentOf ? path.posix.dirname(entry.path) : entry.path;
      if (parent === '.') parent = '';
    }
    pendingPreview = null; const activeFolders = folders;
    return tree.withOperation(token,()=>kind === 'directory' ? activeFolders.createDirectory(side,parent,name) : activeFolders.createFile(side,parent,name));
  });
  handle('folders:tree-destination',async (action,side,ids,token,scope=null)=>{
    if (!['copy','move'].includes(action)) throw new Error('Choose copy or move.');
    const {tree,paths} = await resolveTreePaths(side,ids,token); pendingPreview = null;
    const choose = async () => {
      const result = await dialog.showOpenDialog(mainWindow,{title:action === 'move' ? 'Move to Folder' : 'Copy to Folder',properties:['openDirectory','createDirectory']});
      return result.canceled ? null : result.filePaths[0];
    };
    const staged = scope!==null ? (action==='move'?await previewFilteredMove(folders,tree,side,paths,scope,choose):await previewFilteredCopyToFolder(folders,tree,side,paths,scope,choose)) : action === 'move' ? await previewMove(folders,side,paths,choose,{validateContext:()=>tree.checkRevision(token)}) : await previewCopyToFolder(folders,side,paths,choose);
    if (!staged) return null; await tree.checkRevision(token);
    const service = {execute:id=>tree.withOperation(token,()=>staged.service.execute(id))};
    pendingPreview = {id:staged.preview.id,mode:action,direction:staged.preview.direction,side,...staged,service};
    return {...staged.preview,source:staged.source,destination:staged.destination,...(scope!==null?{operationScope:scope}:{})};
  });
  handle('folders:list', relative => {
    if (relative !== '' && relative != null) relativePathValue(relative);
    return folders.list(relative || '');
  });
  handle('folders:compare-node', (relative, rules) => {
    if (relative !== '' && relative != null) relativePathValue(relative);
    return folders.compareNode(relative || '', rules);
  });
  const renameFolderEntry = async (side, relative, newName) => {
    sideValue(side); relativePathValue(relative);
    if(remoteRoots.get(folders)?.[side]||pendingRemoteRoots.get(folders)?.[side]||!folders.roots[side])throw Error('Choose a connected local folder side.');
    const originalPath = await folders.safe(side, relative);
    folders.entryName(newName);
    shared.checkAlignmentRename(originalPath,path.join(path.dirname(originalPath),newName));
    const result = await folders.renameEntry(side, relative, newName);
    const remappedContexts = shared.remapRenamedContexts(mainWindow,originalPath, path.join(folders.roots[side], result.path));
    return {...result, remappedContexts};
  };
  handle('folders:rename',renameFolderEntry);
  handle('folders:create-directory', async (side, parent, name) => {
    sideValue(side);
    if (parent !== '') relativePathValue(parent);
    const result = await folders.createDirectory(side, parent, name);
    invalidateTree();
    pendingPreview = null;
    return result;
  });
  handle('folders:create-file', async (side, parent, name) => {
    sideValue(side);
    if (parent !== '') relativePathValue(parent);
    const result = await folders.createFile(side, parent, name);
    invalidateTree();
    pendingPreview = null;
    return result;
  });
  handle('folders:set-modified', async (side, paths, modifiedMs) => {
    try {
      return await setFolderModified((...args) => folders.safe(...args), side, paths, modifiedMs);
    } finally {
      invalidateTree();
      // A failed rollback can leave changed timestamps; never retain old previews.
      pendingPreview = null;
      folders.plans.clear();
      folders.hashCache.clear();
    }
  });
  handle('folders:reveal', async (side, relative) => {
    sideValue(side); relativePathValue(relative);
    const file = await folders.safe(side, relative);
    shell.showItemInFolder(file);
    return true;
  });
  handle('folders:copy-paths', async (side, paths) => {
    sideValue(side);
    if (!Array.isArray(paths) || !paths.length || paths.length > 50000) throw new Error('Choose files or folders first.');
    const files = [];
    for (const relative of paths) {
      relativePathValue(relative);
      files.push(await folders.safe(side, relative));
    }
    clipboard.writeText(files.join('\n'));
    return true;
  });
  handle('folders:action', async (action, side, paths) => {
    sideValue(side);
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    if (!['copy','delete','move'].includes(action)) throw new Error('Choose copy, move or delete.');
    if (!Array.isArray(paths) || !paths.length || paths.length > 50000) throw new Error('Choose the files to include.');
    paths.forEach(relativePathValue);
    pendingPreview = null;
    if (action === 'move') {
      const moved = await previewMove(folders,side,paths);
      pendingPreview = {id:moved.preview.id,mode:'move',direction:moved.preview.direction,side,...moved};
      return {...moved.preview,source:moved.source,destination:moved.destination};
    }
    const preview = await folders.previewAction(action, side, paths);
    pendingPreview = {id:preview.id,mode:action,direction:side === 'a' ? 'a-to-b' : 'b-to-a',side,preview};
    return preview;
  });
  handle('folders:copy-to-folder', async (side, paths) => {
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    pendingPreview = null;
    const plan = await previewCopyToFolder(folders, side, paths, async () => {
      const result = await dialog.showOpenDialog(mainWindow, {title:'Copy to Folder',properties:['openDirectory','createDirectory']});
      return result.canceled ? null : result.filePaths[0];
    });
    if (!plan) return null;
    pendingPreview = {id:plan.preview.id,mode:'copy',direction:'a-to-b',side, ...plan};
    return {...plan.preview,source:plan.source,destination:plan.destination};
  });
  handle('folders:move-to-folder', async (side, paths) => {
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    pendingPreview = null;
    const moved = await previewMove(folders,side,paths,async () => {
      const result = await dialog.showOpenDialog(mainWindow,{title:'Move to Folder',properties:['openDirectory','createDirectory']});
      return result.canceled ? null : result.filePaths[0];
    });
    if (!moved) return null;
    pendingPreview = {id:moved.preview.id,mode:'move',direction:moved.preview.direction,side,...moved};
    return {...moved.preview,source:moved.source,destination:moved.destination};
  });
  handle('folders:save-snapshot', async side => {
    sideValue(side);
    const root = await folders.directoryPath(side);
    const result = await dialog.showSaveDialog(mainWindow, {title:'Save folder snapshot',defaultPath:path.basename(root)+'.fcsnapshot',filters:[{name:'Folder snapshot',extensions:['fcsnapshot']}]});
    if (result.canceled || !result.filePath) return {cancelled:true};
    const snapshot = await createSnapshot(root);
    await saveSnapshot(result.filePath,snapshot);
    return {cancelled:false,path:result.filePath};
  });
  handle('folders:compare-snapshots', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {title:'Choose two folder snapshots',properties:['openFile','multiSelections'],filters:[{name:'Folder snapshots',extensions:['fcsnapshot','json']}]});
    if (result.canceled) return null;
    if (result.filePaths.length !== 2) throw new Error('Choose exactly two folder snapshots.');
    const left = await loadSnapshot(result.filePaths[0]), right = await loadSnapshot(result.filePaths[1]);
    return {...compareSnapshots(left,right),leftName:path.basename(result.filePaths[0]),rightName:path.basename(result.filePaths[1])};
  });
  const openFolderPair = async (leftRelative, rightRelative, encoding='auto') => {
    const current=openOwner();
    const staged = await stageFolderPair(folders,leftRelative,rightRelative,undefined,encoding,{extractPdfText,extractDocText});
    const snapshots=await validateStagedPair(staged);current();
    const stagedAuthorities = staged.service || staged.mode === 'text-compare' ? new Map() : snapshotAuthorities(staged,snapshots);
    const {id} = createContext();
    dataAuthorities = stagedAuthorities;
    if (staged.service) {
      folders = staged.service;
      return {id,mode:staged.mode,name:staged.name,folders:staged.folders};
    }
    if (staged.mode === 'text-compare') for (const side of ['a','b']) {
      textPaths[side] = staged[side].path;
      textFormats[side] = staged[side].format;
      textInputEncodings[side] = staged[side].format.encoding;
      if(staged[side].documentProjection)textProjections[side]=staged[side].documentProjection;
      revisions[side] = staged.revisions[side];
    }
    return {id,mode:staged.mode,name:staged.name,a:staged.a,b:staged.b};
  };
  handle('folders:open-pair',openFolderPair);
  const openFolderFiles=async(relative,binary)=>{
    relativePathValue(relative);const current=openOwner(),service=folders,checkScope=await folderOpenScope(service);
    const staged=await stageFolderFiles(service,{a:relative,b:relative},binary);
    await checkScope();await staged.validate();current();
    const authorities=binary?snapshotAuthorities(staged.values,staged.snapshots):new Map();
    const {id}=createContext();dataAuthorities=authorities;
    if(!binary)for(const side of ['a','b'])if(staged.stages[side])commitLoaded(side,staged.stages[side]);
    return {id,...staged.values};
  };
  handle('folders:open-data',relative=>openFolderFiles(relative,true));
  handle('folders:open-files',relative=>openFolderFiles(relative,false));

  handle('folders:navigate-parents', async () => {
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    const result = await folderNavigation.navigateParents(folders);
    replaceTree(folders,new FolderTree(treeService(folders),undefined,folderTrees.get(folders)?.nameRules));
    pendingPreview = null;
    return result;
  });
  handle('folders:navigation', async () => {const service=folders,result=await folderNavigation.snapshot(service);for(const side of ['a','b']){const remote=remoteRoots.get(service)?.[side],pending=pendingRemoteRoots.get(service)?.[side];if(remote||pending)result[side]={...result[side],path:remote?.descriptor.path||pending.root,remote:true,disconnected:!remote,canParent:false,canBack:false,canForward:false};}return result;});
  handle('folders:navigate', async (side, action, value) => {
    sideValue(side);
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    if((remoteRoots.get(folders)?.[side]||pendingRemoteRoots.get(folders)?.[side])&&action!=='path')throw Error('Choose a remote root through the SFTP connection dialog, or enter a local path.');
    const result = await folderNavigation.navigate(folders, side, action, value);
    clearRemoteSide(folders,side);
    replaceTree(folders,new FolderTree(treeService(folders),undefined,folderTrees.get(folders)?.nameRules));
    pendingPreview = null;
    return result;
  });
  handle('folders:choose', async side => {
    sideValue(side);
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `Choose ${side === 'a' ? 'left' : 'right'} folder`,
      properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) return null;
    const selected = await folderNavigation.navigate(folders, side, 'path', result.filePaths[0]);
    clearRemoteSide(folders,side);
    replaceTree(folders,new FolderTree(treeService(folders),undefined,folderTrees.get(folders)?.nameRules));
    pendingPreview = null;
    return selected;
  });

  handle('folders:scan', async () => {
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    pendingPreview = null;
    return folders.scan();
  });

  handle('folders:preview', async (mode, direction, paths) => {
    if (executing) throw new Error('Wait for the current folder operation to finish.');
    if (!['merge', 'sync'].includes(mode)) throw new Error('Choose merge or sync.');
    if (!['a-to-b', 'b-to-a'].includes(direction)) throw new Error('Choose a valid transfer direction.');
    if (paths != null && (!Array.isArray(paths) || paths.length > 50000)) throw new Error('Choose the files to include.');
    paths?.forEach(relativePathValue);
    pendingPreview = null;
    const preview = await folders.preview(mode, direction, paths);
    pendingPreview = {id: preview.id, mode, direction, preview};
    return preview;
  });

  handle('folders:execute', async id => {
    if (executing) throw new Error('A folder operation is already running.');
    if (typeof id !== 'string' || id.length > 200 || !pendingPreview || pendingPreview.id !== id) {
      throw new Error('Preview the folder changes again before applying them.');
    }
    const plan = pendingPreview;
    if(plan.remoteTransfer)return plan.transfer.kind==='rename'?executeRemoteRename(plan):plan.transfer.kind==='delete'?executeRemoteDelete(plan):executeRemoteCopy(plan);
    executing = true;
    try {
      const operations = plan.preview.operations || plan.preview.actions || [];
      const count = operations.length;
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Apply folder changes?',
        message: plan.mode === 'update-both' ? 'Copy newer and one-sided files in both directions?' : plan.mode === 'update' ? `Copy newer and one-sided files ${plan.direction === 'a-to-b' ? 'left to right' : 'right to left'}?` : plan.mode === 'move' ? 'Move selected items and remove them from the source?' : plan.destination ? 'Copy selected items to this folder?' : plan.mode === 'delete' ? `Delete selected items on the ${plan.side === 'a' ? 'left' : 'right'}?` : `Apply ${plan.mode} from ${plan.direction === 'a-to-b' ? 'left to right' : 'right to left'}?`,
        detail: `${plan.destination ? `From: ${plan.source}\nTo: ${plan.destination}\n\n` : ''}${count} planned file change${count === 1 ? '' : 's'}.\n\nExisting files that are replaced or removed are backed up in the application's backup folder. Review the preview before continuing.`,
        buttons: ['Cancel', 'Apply changes'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      });
      if (result.response !== 1) return {cancelled: true};
      pendingPreview = null;
      return await (plan.service || folders).execute(id);
    } finally {
      if (!(plan.service instanceof MappedFolderOperations) && !(plan.service instanceof UpdateBothOperations)) invalidateTree();
      executing = false;
    }
  });

  handle('folders:read', async (side, relativePath) => {
    sideValue(side);relativePathValue(relativePath);
    const current=openOwner(),service=folders,checkScope=await folderOpenScope(service);
    const file=await service.safe(side,relativePath),staged=await stageText(file);
    await checkScope();if(await service.safe(side,relativePath)!==staged.snapshot.path)throw Error('The folder entry changed while opening.');
    await localSnapshot.validate(staged.snapshot);current();return commitLoaded(side,staged);
  });
  const openText=async(side,file,encoding,current,readOptions={})=>{
    const staged=await stageText(file,encoding,readOptions);await localSnapshot.validate(staged.snapshot);current();return commitLoaded(side,staged);
  };
  handle('text:open', async (side, encoding = 'auto', options) => {
    const readOptions=pdfReadOptions(options);sideValue(side);const current=openOwner();
    const result=await dialog.showOpenDialog(mainWindow,{title:`Open ${side==='a'?'left':'right'} file`,properties:['openFile']});
    if(result.canceled||!result.filePaths.length)return null;
    return openText(side,result.filePaths[0],encoding,current,readOptions);
  });
  handle('text:open-path', async (side, value, encoding = 'auto', options) => {
    const readOptions=pdfReadOptions(options);sideValue(side);
    if(typeof value!=='string'||!value||value.length>32768||value.includes('\0')||!path.isAbsolute(value))throw Error('Drop a file from your file manager.');
    return openText(side,value,encoding,openOwner(),readOptions);
  });
  handle('text:reload', async (side, encoding, options) => {
    const readOptions=pdfReadOptions(options===undefined?{docScope:textProjections[side]?.kind==='doc'?textProjections[side].scope:'main-document',pdfOrder:textProjections[side]?.order??'document',docxScope:textProjections[side]?.kind==='docx'?textProjections[side].scope:'main-document',odtScope:textProjections[side]?.kind==='odt'?textProjections[side].scope:'main-document'}:options);sideValue(side);
    if(!textPaths[side]){if(remoteChildOrigins.get(activeId)?.sources[side])throw Error('This remote input is an opened snapshot. Reopen it from its folder, or save a local copy.');return null;}
    return openText(side,textPaths[side],encoding||textInputEncodings[side]||'auto',openOwner(),readOptions);
  });
  handle('session:swap', () => {
    const childOrigins=remoteChildOrigins.get(activeId)?.sources;if(childOrigins)[childOrigins.a,childOrigins.b]=[childOrigins.b,childOrigins.a];
    [textPaths.a, textPaths.b] = [textPaths.b, textPaths.a];
    [revisions.a, revisions.b] = [revisions.b, revisions.a];
    [textFormats.a, textFormats.b] = [textFormats.b, textFormats.a];
    [textInputEncodings.a, textInputEncodings.b] = [textInputEncodings.b, textInputEncodings.a];
    [textProjections.a,textProjections.b]=[textProjections.b,textProjections.a];
    folderNavigation.swap(folders);
    const swappedAlignment = folderTrees.get(folders)?.manualAlignment.swap();
    [folders.roots.a, folders.roots.b] = [folders.roots.b, folders.roots.a];
    const remote=remoteRoots.get(folders);if(remote)remoteRoots.set(folders,{a:remote.b,b:remote.a});
    const pending=pendingRemoteRoots.get(folders);if(pending)pendingRemoteRoots.set(folders,{a:pending.b,b:pending.a});
    replaceTree(folders,new FolderTree(treeService(folders),swappedAlignment,folderTrees.get(folders)?.nameRules));
    folders.plans.clear(); pendingPreview = null;
    return true;
  });
  handle('session:reset', async () => {
    if(executing)throw new Error('Wait for the current folder operation to finish.');
    const resettingId=activeId,remoteCleanup=revokeSftpSession(resettingId);
    try {
    await Promise.all([dropFolderPatch(resettingId),remoteCleanup]);attributePlans.delete(resettingId);
    threeWayFolders.delete(folders);
    folderNavigation.reset(folders);
    replaceTree(folders,new FolderTree(treeService(folders),undefined,folderTrees.get(folders)?.nameRules));
    dataAuthorities = new Map();
    textPaths = {}; revisions = {}; textFormats = {}; textInputEncodings = {}; textProjections = {}; sessionPath = null; folders.roots = {}; folders.plans.clear(); folders.hashCache.clear(); pendingPreview = null;
    return true;
    } finally {sftpBlocked.delete(resettingId);}
  });
  handle('workspace:save', async value => {
    rememberContext();
    if (!value || !Array.isArray(value.entries) || !value.entries.length || value.entries.length>20 || new Set(value.entries.map(entry=>entry.id)).size!==value.entries.length) throw new Error('Choose between 1 and 20 open comparisons.');
    const sessions=value.entries.map(entry=>{
      const context=contexts.get(entry.id);
      if(!context)throw new Error('A comparison is no longer open.');
      const data=nativeSessionData(entry.data,context.folders);
      if(data.type==='folder-merge3'){
        const threeWay=threeWayFor(context.folders);
        data.threeWay.roots=Object.fromEntries(['base','left','right'].map(side=>[side,threeWay.roots[side]||null]));
        data.threeWay.output=threeWay.output;
      }
      if(['folder-compare','folder-merge','folder-sync'].includes(data.type)){data.options.folderAlignment=treeFor(context.folders).manualAlignment.pairs;data.options.folderNameRules=treeFor(context.folders).nameRules;}
      data.options.textInputEncodings={};
      for(const side of ['a','b']){
        data.files[side].path=data.files[side].path===context.textPaths[side]?context.textPaths[side]:'';
        if(data.files[side].path&&context.textProjections?.[side])data.files[side].documentProjection=context.textProjections[side];
        data.folders[side]=context.folders.roots[side]?{name:path.basename(context.folders.roots[side]),path:context.folders.roots[side]}:null;
        data.options.textInputEncodings[side]=data.files[side].path?(context.textInputEncodings[side]||'auto'):'auto';
      }
      return data;
    });
    const data=validateWorkspace({version:1,kind:'workspace',sessions,activeIndex:value.activeIndex});
    const result=await dialog.showSaveDialog(mainWindow,{title:'Save workspace',defaultPath:'Workspace.fcworkspace',filters:[{name:'Further Compare workspace',extensions:['fcworkspace']}],properties:['createDirectory','showOverwriteConfirmation']});
    if(result.canceled||!result.filePath)return {cancelled:true};
    await writeWorkspace(result.filePath,data);
    return {cancelled:false,path:result.filePath};
  });
  handle('workspace:open', async () => {
    const current=openOwner();
    const result=await dialog.showOpenDialog(mainWindow,{title:'Open workspace',properties:['openFile'],filters:[{name:'Further Compare workspace',extensions:['fcworkspace']}]});
    if(result.canceled||!result.filePaths.length)return null;
    const staged=await stageWorkspace(result.filePaths[0],folders.backupRoot), entries=[],snapshots=[],scopes=[];
    // Prepare every context before publishing any tab or native authority.
    for(const item of staged.sessions){
      const stamps={};for(const side of ['a','b'])if(item.textPaths[side]){const snapshot=await localSnapshot.capture(item.textPaths[side]);snapshots.push(snapshot);stamps[side]=snapshot.revision;}
      scopes.push(await folderOpenScope(item.folders));
      entries.push({id:randomUUID(),data:item.data,context:{folders:item.folders,textPaths:item.textPaths,sessionPath:null,pendingPreview:null,revisions:stamps,textFormats:{...item.data.options.textFormats},textInputEncodings:{...item.data.options.textInputEncodings},textProjections:Object.fromEntries(['a','b'].filter(side=>item.data.files[side].documentProjection).map(side=>[side,item.data.files[side].documentProjection])),dataAuthorities:new Map()},threeWay:item.threeWay});
    }
    for(const entry of entries){restoreRemoteDescriptors(entry.context.folders,entry.data);entry.tree=new FolderTree(treeService(entry.context.folders),new FolderAlignment(entry.data.options.folderAlignment||[],endpointKinds(entry.context.folders)),entry.data.options.folderNameRules);}
    for(const check of scopes)await check();for(const snapshot of snapshots)await localSnapshot.validate(snapshot);current();
    for(const entry of entries){
      contexts.set(entry.id,entry.context);
      replaceTree(entry.context.folders,entry.tree);
      if(entry.threeWay)threeWayFolders.set(entry.context.folders,entry.threeWay);
    }
    return {entries:entries.map(({id,data})=>({id,data})),activeIndex:staged.data.activeIndex,path:result.filePaths[0]};
  });
  handle('session:open', async () => {
    const current=openOwner(),replacingId=activeId;
    const result=await dialog.showOpenDialog(mainWindow,{title:'Open session',properties:['openFile'],filters:[{name:'Further Compare session',extensions:['fcompare','json']}]});
    if(result.canceled||!result.filePaths.length)return null;
    const staged=await stageSession(result.filePaths[0],folders.backupRoot),snapshots={},stamps={};
    // Saved text is an intentional edited snapshot, not a request to reread disk.
    for(const side of ['a','b'])if(staged.textPaths[side]){snapshots[side]=await localSnapshot.capture(staged.textPaths[side]);stamps[side]=snapshots[side].revision;}
    const checkScope=await folderOpenScope(staged.folders);
    restoreRemoteDescriptors(staged.folders,staged.data);
    const nextTree=new FolderTree(treeService(staged.folders),new FolderAlignment(staged.data.options.folderAlignment||[],endpointKinds(staged.folders)),staged.data.options.folderNameRules);
    try {
      await checkScope();for(const snapshot of Object.values(snapshots))await localSnapshot.validate(snapshot);current();
      // Revocation is synchronous; transport disposal is background work on the old owner.
      // No asynchronous operation or validation may separate this point from publication.
      void revokeSftpSession(replacingId).catch(()=>{});
      if(staged.threeWay)threeWayFolders.set(staged.folders,staged.threeWay);
      folderTrees.get(folders)?.dispose();folders=staged.folders;replaceTree(folders,nextTree);
      textPaths=staged.textPaths;sessionPath=result.filePaths[0];pendingPreview=null;dataAuthorities=new Map();
      revisions=stamps;textFormats={...staged.data.options.textFormats};textInputEncodings={...staged.data.options.textInputEncodings};textProjections=Object.fromEntries(['a','b'].filter(side=>staged.data.files[side].documentProjection).map(side=>[side,staged.data.files[side].documentProjection]));
      return {data:staged.data,path:sessionPath};
    } catch(error){nextTree.dispose();throw error;}finally{sftpBlocked.delete(replacingId);}
  });
  handle('session:set-locked', async locked => {
    if(!sessionPath) throw new Error('Save this session before locking it.');
    const result=await setSessionLocked(sessionPath,locked);
    sessionPath=result.path;
    return {locked:result.locked,path:result.path};
  });
  handle('session:save', async (value, saveAs = false) => {
    const data = nativeSessionData(value,folders);
    if (data.type === 'folder-merge3') {
      const roots = threeWayFor().roots;
      data.threeWay.roots = Object.fromEntries(['base','left','right'].map(side=>[side,roots[side] || null]));
      data.threeWay.output = threeWayFor().output;
    }
    if (['folder-compare','folder-merge','folder-sync'].includes(data.type)) {data.options.folderAlignment = treeFor().manualAlignment.pairs;data.options.folderNameRules=treeFor().nameRules;}
    // Renderer paths are display metadata; persist only native-authorized locations.
    for (const side of ['a','b']) {
      data.files[side].path = data.files[side].path && data.files[side].path === textPaths[side] ? textPaths[side] : '';
      if(data.files[side].path&&textProjections[side])data.files[side].documentProjection=textProjections[side];
      data.folders[side] = folders.roots[side] ? {name:path.basename(folders.roots[side]),path:folders.roots[side]} : null;
    }
    if (!data.options.textFormats && Object.keys(textFormats).length) {
      data.options.textFormats = {};
      for (const side of ['a','b']) data.options.textFormats[side] = textFormats[side] || {encoding:'utf8',bom:false,lineEnding:detectLineEnding(data.text[side])};
    }
    // Source decoding is separate from the renderer's desired output format.
    data.options.textInputEncodings = {};
    for (const side of ['a','b']) data.options.textInputEncodings[side] = data.files[side].path ? (textInputEncodings[side] || 'auto') : 'auto';
    const content = JSON.stringify(data, null, 2);
    if (Buffer.byteLength(content) > MAX_SESSION_BYTES) throw new Error('Session exceeds 25 MB.');
    let file = sessionPath;
    if (!file || saveAs) {
      const result = await dialog.showSaveDialog(mainWindow, {title:'Save session',defaultPath:file || (data.name.replace(/[^a-z0-9 _-]/gi, '_') || 'Untitled') + '.fcompare',filters:[{name:'Further Compare session',extensions:['fcompare']}],properties:['createDirectory','showOverwriteConfirmation']});
      if (result.canceled || !result.filePath) return {cancelled:true};
      file = result.filePath;
    }
    const saved=await writeSession(file,data);
    sessionPath = saved.path;
    return {cancelled:false,path:sessionPath,locked:false};
  });

  handle('data:open', async (side, kind) => {
    const current=openOwner();
    const result=await dialog.showOpenDialog(mainWindow,dataOpenDialog(side,kind));
    if(result.canceled||!result.filePaths[0])return null;
    const {bytes,snapshot}=await localSnapshot.read(result.filePaths[0]);
    await localSnapshot.validate(snapshot);current();
    const diskToken=randomUUID();dataAuthorities.set(diskToken,{path:snapshot.path,dev:snapshot.dev,ino:snapshot.ino,sourceKind:protectedDataSourceKind(snapshot.path)});
    return {name:path.basename(snapshot.path),path:snapshot.path,data:bytes.toString('base64'),diskToken};
  });
  handle('archive:open-files', async () => {
    const context=activeId, authorities=dataAuthorities;
    const check=()=>{if(disposed||mainWindow.isDestroyed()||activeId!==context||dataAuthorities!==authorities)throw Error('The archive session changed. Choose the files again.');};
    const result=await dialog.showOpenDialog(mainWindow,{title:'Add files to archive',properties:['openFile','multiSelections']});
    check();
    if(result.canceled||!result.filePaths.length)return null;
    return readArchiveFiles(result.filePaths,{check});
  });
  handle('archive:open-folder', async () => {
    const context=activeId, authorities=dataAuthorities;
    const check=()=>{if(disposed||mainWindow.isDestroyed()||activeId!==context||dataAuthorities!==authorities)throw Error('The archive session changed. Choose the folder again.');};
    const result=await dialog.showOpenDialog(mainWindow,{title:'Add folder to archive',properties:['openDirectory']});
    check();
    if(result.canceled||!result.filePaths.length)return null;
    return readArchiveFolder(result.filePaths[0],{check});
  });
  handle('archive:extract', async items => {
    const plan = validateArchiveExtraction(items);
    const result = await dialog.showOpenDialog(mainWindow,{title:'Choose where to extract selected archive entries',properties:['openDirectory','createDirectory']});
    if(result.canceled||!result.filePaths[0])return {cancelled:true};
    return {cancelled:false,...await extractArchiveEntries(result.filePaths[0],plan)};
  });
  handle('data:save', async (data, suggestedName = 'output.bin', options) => {
    if(options!==undefined&&(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).length!==1||!['table-values','merge-text','ods-copy'].includes(options.kind)))throw Error('Invalid export options.');
    const current=openOwner('The active comparison changed while exporting. Try again.');
    const bytes = decodeData(data);
    if (typeof suggestedName !== 'string' || suggestedName.length > 255 || suggestedName.includes('\0')) throw new Error('Invalid filename.');
    const safeName = path.basename(suggestedName.replace(/\\/g, '/')) || 'output.bin';
    const result = await dialog.showSaveDialog(mainWindow, {defaultPath:safeName,properties:['createDirectory','showOverwriteConfirmation']});
    if (result.canceled || !result.filePath) return {cancelled:true};
    const file = result.filePath;
    const written=await saveLocalFile(file,bytes,{current,validateTarget:async(target,existing)=>{const sources=allDocumentSources();if(options?.kind==='merge-text')assertDocumentTargetSnapshot(target,existing,sources);else for(const source of sources)if(path.resolve(target)===path.resolve(source.path)||existing&&source.revision?.split(':').slice(0,2).join(':')===`${existing.dev}:${existing.ino}`)throw Error('Choose a separate output file; the source document must remain unchanged.');if(options?.kind==='ods-copy')await assertOdsCopyTarget(target,existing,allTableSources(),fs);else if(options?.kind==='table-values'||options?.kind==='merge-text')await assertTableValueTarget(target,existing,allTableSources(),fs);}});
    const saved=await localSnapshot.read(file,bytes.length);
    if(saved.snapshot.dev!==written.dev||saved.snapshot.ino!==written.ino||!Buffer.from(saved.bytes).equals(bytes))throw Error('The exported file changed before it could be verified. Check it on disk.');
    current();
    return {cancelled:false,path:file};
  });
  handle('text:clear-remote-source', (id,side,token) => {
    sideValue(side);if(id!==activeId)throw Error('The text session changed.');
    const origins=remoteChildOrigins.get(id)?.sources;
    if(origins?.[side]?.saveToken===token)delete origins[side];
    return true;
  });
  handle('text:save-remote', async (id,side,token,text,format) => {
    sideValue(side);
    if(textProjections[side])throw Error('Document text is an extracted view. Export a separate text file instead.');
    const origin=remoteChildOrigins.get(id)?.sources[side];
    if(id!==activeId||!origin?.provider||!origin.saveToken||origin.saveToken!==token)throw Error('Reopen this remote file before saving to the server.');
    if(typeof text!=='string'||text.length>MAX_TEXT_BYTES)throw Error('Text must be smaller than 10 MB.');
    const outputFormat=validateFormat(format||textFormats[side]),bytes=encodeText(text,outputFormat);
    const savedFormat=decodeText(bytes,outputFormat.encoding).format;
    if(bytes.length>MAX_TEXT_BYTES)throw Error('Encoded text must be smaller than 10 MB.');
    if(remoteTextSaveJobs.has(id))throw Error('Wait for the current remote save.');
    const controller=new AbortController();remoteTextSaveJobs.set(id,controller);
    const current=()=>{if(disposed||controller.signal.aborted||id!==activeId||remoteChildOrigins.get(id)?.sources[side]!==origin||origin.provider.connection.closed)throw Error('The remote file or connection changed. Reopen it before saving.');};
    try{
      current();const prepared=await prepareSftpTextSave(origin,bytes,{signal:controller.signal});current();
      const review=await dialog.showMessageBox(mainWindow,{type:'question',title:'Save to server',message:'Replace this remote file?',detail:origin.source.displayPath+'\n\n'+bytes.length.toLocaleString()+' bytes · '+outputFormat.encoding+'\nThe server file is checked against the opened version before replacement. A simultaneous external edit during replacement cannot be prevented by SFTP.',buttons:['Cancel','Save to server'],defaultId:0,cancelId:0,noLink:true});
      if(review.response!==1)return {cancelled:true};current();
      const saved=await commitSftpTextSave(prepared,{signal:controller.signal});current();
      origin.observation=saved.observation;textFormats[side]=savedFormat;textInputEncodings[side]=savedFormat.encoding;
      return {cancelled:false,remote:true,format:savedFormat,displayPath:origin.source.displayPath};
    }finally{if(remoteTextSaveJobs.get(id)===controller)remoteTextSaveJobs.delete(id);}
  });
  handle('text:save', async (text, suggestedName = 'merged.txt', side, format) => {
    const current=openOwner('The active comparison changed while saving. Try again.');
    if (typeof text !== 'string' || text.length > MAX_TEXT_BYTES) {
      throw new Error('Text must be smaller than 10 MB.');
    }
    if (typeof suggestedName !== 'string' || suggestedName.length > 255 || suggestedName.includes('\0')) {
      throw new Error('Invalid filename.');
    }
    if (side !== undefined) sideValue(side);
    const baseName = path.basename(suggestedName.replace(/\\/g, '/')) || 'merged.txt';
    const safeName=isDocumentInput(baseName)?baseName.replace(/\.(doc|docx|pdf|rtf|odt)$/i,'.txt'):baseName;
    const outputFormat = validateFormat(format || textFormats[side] || {encoding:'utf8',bom:false,lineEnding:'none'});
    const bytes = encodeText(text, outputFormat);
    const decoded = decodeText(bytes,outputFormat.encoding);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save text',
      defaultPath: safeName,
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (result.canceled || !result.filePath) return {cancelled: true};
    const sources=allDocumentSources();
    await assertTextExportTarget(result.filePath,sources,fs);current();
    const writtenSnapshot=await saveLocalFile(result.filePath,bytes,{current,validateTarget:async(target,existing)=>{assertDocumentTargetSnapshot(target,existing,allDocumentSources());await assertTableValueTarget(target,existing,allTableSources(),fs);}});
    if(side){
      const staged=await stageText(result.filePath,outputFormat.encoding);
      if(staged.snapshot.dev!==writtenSnapshot.dev||staged.snapshot.ino!==writtenSnapshot.ino||!Buffer.from(encodeText(staged.value.content,staged.value.format)).equals(Buffer.from(bytes)))throw Error('The saved file changed before it could be opened. Reopen it from disk.');
      await localSnapshot.validate(staged.snapshot);current();commitLoaded(side,staged);
    }
    return {cancelled: false, path: result.filePath, name: path.basename(result.filePath),format:decoded.format};
  });
}


 function protectedDataSourceKind(file){return isDocumentInput(file)?path.extname(file).slice(1).toLowerCase():protectedTableSourceKind(file);}
 function ownDocumentSources(){
  if(disposed)return [];
  const sources=[],saved=[...contexts].filter(([id])=>id!==activeId).map(([,context])=>context);
  for(const context of [...saved,{textPaths,revisions,textProjections}])for(const side of ['a','b'])if(context.textProjections?.[side]&&context.textPaths[side])sources.push({path:context.textPaths[side],revision:context.revisions[side]});
  const maps=[dataAuthorities,...saved.map(context=>context.dataAuthorities)];for(const map of maps)for(const source of map.values())if(['pdf','docx','rtf','odt','doc'].includes(source.sourceKind))sources.push({path:source.path,revision:`${source.dev}:${source.ino}`});
  return sources;
 }
 function ownTableSources(){
  if(disposed)return [];
  const maps=[dataAuthorities,...[...contexts].filter(([id])=>id!==activeId).map(([,context])=>context.dataAuthorities)];
  return maps.flatMap(map=>[...map.values()].filter(source=>['ods','xls','xlsb'].includes(source.sourceKind)));
 }
 function allTableSources(){return [...(tableSourceReaders.get(app)||[])].flatMap(read=>read());}
 function allDocumentSources(){return [...(documentSourceReaders.get(app)||[])].flatMap(read=>read());}
 registerHandlers();
 let sourceReaders=documentSourceReaders.get(app);if(!sourceReaders){sourceReaders=new Set();documentSourceReaders.set(app,sourceReaders);}sourceReaders.add(ownDocumentSources);
 let tableReaders=tableSourceReaders.get(app);if(!tableReaders){tableReaders=new Set();tableSourceReaders.set(app,tableReaders);}tableReaders.add(ownTableSources);
 for(const channel of remoteOpenChannels){const handler=immediateHandlers.get(channel);if(handler)immediateHandlers.set(channel,(event,...args)=>{assertRemoteAction(channel,args);return handler(event,...args);});}
 return {window:mainWindow,handlers,immediateHandlers,checkAlignmentRename,remapRenamedContexts,
  isExecuting:()=>executing||running>0,
  useImmediateHandler:channel=>!remoteOpenChannels.has(channel)||hasRemote(),
  dispose(){disposed=true;cancelPdfExtraction();mainWindow.removeListener('closed',cancelPdfExtraction);if(explorerIntegrationService)explorerIntegrationService.revokeOwner(explorerIntegrationOwner);tableReaders.delete(ownTableSources);if(!tableReaders.size&&tableSourceReaders.get(app)===tableReaders)tableSourceReaders.delete(app);sourceReaders.delete(ownDocumentSources);if(!sourceReaders.size&&documentSourceReaders.get(app)===sourceReaders)documentSourceReaders.delete(app);for(const id of [...remoteTransfers.keys()])revokeTransfer(id);cancelledTransferRequests.clear();for(const controller of remoteTextSaveJobs.values())controller.abort();remoteTextSaveJobs.clear();for(const service of remoteChildJobs.keys())cancelRemoteChildren(service);remoteChildOrigins.clear();for(const id of sftpSessions.keys())revokeSftpSession(id);const remoteCleanup=Promise.allSettled([...sftpCleanup]);sftpBlocked.clear();folderReads.dispose();folderTrees.get(folders)?.dispose();attributePlans.clear();for(const plan of folderPatchPlans.values())plan.service.dispose().catch(()=>{});folderPatchPlans.clear();folderSizeRequest?.controller.abort();if(filenameScan)filenameScan.cancelled=true;cancelledFilenameScans.clear();rememberContext();for(const context of contexts.values()){folderTrees.get(context.folders)?.dispose();context.pendingPreview=null;context.folders.plans.clear();context.folders.hashCache.clear();context.dataAuthorities.clear();}contexts.clear();activeId=null;pendingPreview=null;dataAuthorities.clear();textPaths={};sessionPath=null;folders.plans.clear();folders.roots={};return remoteCleanup;}
 };
}
module.exports={createWindowRuntime};
