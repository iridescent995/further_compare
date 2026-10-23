'use strict';
const {FOLDER_FILTERS}=require('./folder-display.cjs');
const {validateWorkspace,stageWorkspace,writeWorkspace}=require('./workspaces.cjs');
const {setSessionLocked,writeSession}=require('./session-locks.cjs');

const {applyTransferredPreferences}=require('./settings-apply.cjs');
const {KeyboardShortcuts}=require('./keyboard-shortcuts.cjs');
let shortcutCatalog=[],shortcutOverrides={},shortcutStore=null;
const shortcutState=()=>({catalog:shortcutCatalog,overrides:shortcutOverrides,platform:process.platform});
const {app, BrowserWindow, dialog, ipcMain, Menu, session, shell, clipboard} = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const {randomUUID} = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {FolderService} = require('./folders.cjs');
const {readFolderTextReport} = require('./folder-text-report.cjs');
const {dataOpenDialog} = require('./data-dialogs.cjs');
const {validateArchiveExtraction,extractArchiveEntries} = require('./archive-extract.cjs');
const {BatchService}=require('./batch-service.cjs');
const {readFolderProperties,readFolderSize} = require('./folder-properties.cjs');
const {ThreeWayFolders} = require('./folder-threeway.cjs');
const {ThreeWayRecovery} = require('./folder-threeway-recovery.cjs');
const {FolderTree} = require('./folder-tree.cjs');
const {FolderAlignment} = require('./folder-alignment.cjs');
const {MappedFolderOperations} = require('./folder-mapped-operations.cjs');
const {UpdateBothOperations} = require('./folder-update-both.cjs');
const {FolderNavigation} = require('./folder-navigation.cjs');
const {previewCopyToFolder} = require('./copy-destination.cjs');
const {previewMove} = require('./folder-move.cjs');
const {previewFilteredMove} = require('./folder-filtered-move.cjs');
const {previewFilteredDelete} = require('./folder-filtered-delete.cjs');
const {previewFilteredCopyToFolder} = require('./folder-filtered-copy-destination.cjs');
const {stageFolderPair} = require('./folder-pair.cjs');
const {ShellRequests} = require('./shell-requests.cjs');
const shellIntegration = require('./shell-integration.cjs');
const {createFinderIntegration}=require('./finder-integration.cjs');
const finderIntegration=app.isPackaged && process.platform==='darwin'
  ? createFinderIntegration({appPath:path.resolve(process.execPath,'../../..')}) : null;
const {ExternalEditor,validateSettings:validateEditorSettings} = require('./external-editor.cjs');
const {normalizeSettingsTransfer,readSettingsTransfer,writeSettingsTransfer}=require('./settings-transfer.cjs');
const {SessionDefaults,captureSessionDefaults}=require('./session-defaults.cjs');
const {setFolderModified} = require('./folder-timestamps.cjs');
const execFileAsync = require('node:util').promisify(require('node:child_process').execFile);
const {createSnapshot,saveSnapshot,loadSnapshot,compareSnapshots} = require('./snapshots.cjs');
const {validateSession, readLimited, stageSession, MAX_TEXT_BYTES, MAX_SESSION_BYTES, TYPES, decodeData, readDataLimited, readTextLimited} = require('./sessions.cjs');

const {encodeText,decodeText,validateFormat,detectLineEnding}=require('../src/text-codec.cjs');

const entryPath = path.join(__dirname, '..', 'dist', 'compare.html');
const entryURL = pathToFileURL(entryPath).href;
if (process.env.FC_USER_DATA_DIR) app.setPath('userData', path.resolve(process.env.FC_USER_DATA_DIR));
let shellReady = false;
let pdfTextService=null;
const extractPdfText=(bytes,options)=>{if(!app.isReady())throw Error('Document extraction is not ready.');if(!pdfTextService)pdfTextService=require('./pdf-text-service.cjs').createPdfTextService({app,BrowserWindow,ipcMain,assetRoot:path.join(__dirname,'..','dist','pdf')});return pdfTextService.extract(bytes,options);};
const pdfTextAdapter=Object.freeze({extract:extractPdfText});
const primaryInstance = app.requestSingleInstanceLock({shellArgs:process.argv});
if (!primaryInstance) app.quit();
const {FileActionHistory}=require('./file-action-history.cjs');
const fileActionHistory=new FileActionHistory(path.join(app.getPath('userData'),'file-action-history.json'));
const externalEditor = new ExternalEditor(path.join(app.getPath('userData'), 'external-editor.json'));
const {SftpProfiles}=require('./sftp-profiles.cjs');
const sftpProfiles=new SftpProfiles(path.join(app.getPath('userData'),'sftp-profiles.json'));
const {SftpKnownHosts}=require('./sftp-known-hosts.cjs');
const sftpKnownHosts=new SftpKnownHosts(path.join(app.getPath('userData'),'sftp-known-hosts.json'));
const sessionDefaults = new SessionDefaults(path.join(app.getPath('userData'),'session-defaults.json'));
const explorerHint = primaryInstance && app.isPackaged && process.platform==='win32'
  ? require('./windows-explorer-hint.cjs').createWindowsExplorerHint({appPath:process.execPath,tempRoot:app.getPath('temp'),systemRoot:process.env.SystemRoot||'C:\\Windows'}) : null;
const shellRequests = new ShellRequests(path.join(app.getPath('userData'), 'shell-left.json'),{publishHint:explorerHint?.publish,extractPdfText,extractDocText:require('../src/doc-text-node.cjs').extractDocTextInNode});
if (primaryInstance) shellRequests.enqueue(process.argv);
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (!primaryInstance) return;
  shellRequests.enqueueURL(url);
  if (!shellReady || !app.isReady()) return;
  const target=focusedRuntime()?.window||createWindow();
  if(target.isMinimized())target.restore();target.show();target.focus();
});
app.on('second-instance', (_event, argv, _workingDirectory, additionalData) => {
  // Chromium can reorder argv switches; additionalData preserves literal command order.
  const originalArgs = additionalData?.shellArgs;
  shellRequests.enqueue(Array.isArray(originalArgs) && originalArgs.length <= 256 && originalArgs.every(value => typeof value === 'string' && value.length <= 32768) ? originalArgs : argv);
  if (!shellReady || !app.isReady()) return;
  const target=focusedRuntime()?.window||createWindow();
  if(target.isMinimized())target.restore();target.show();target.focus();
});

const {createWindowRuntime}=require('./window-runtime.cjs');
const runtimes=new Map(),registeredChannels=new Set(),pendingOperations=new WeakMap();
const runtimeBusy=runtime=>runtime.isExecuting()||(pendingOperations.get(runtime)||0)>0;
const {createOperationQueue}=require('./operation-queue.cjs');
const operationQueue=createOperationQueue();
const detachedTreeReads=new Set(['folders:tree-list','folders:tree-compare','folders:tree-compare-selected','folders:tree-refresh-selected']);
let lastFocused=null,folderNavigation;
function focusedRuntime(){
 const focused=BrowserWindow.getFocusedWindow?.();
 if(focused&&!focused.isDestroyed()&&runtimes.has(focused.webContents.id))return runtimes.get(focused.webContents.id);
 if(lastFocused&&!lastFocused.window.isDestroyed()&&runtimes.has(lastFocused.window.webContents.id))return lastFocused;
 return [...runtimes.values()].find(runtime=>!runtime.window.isDestroyed())||null;
}
function senderRuntime(event){
 const runtime=runtimes.get(event.sender?.id),window=runtime?.window;
 if(!window||window.isDestroyed()||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==entryURL)throw Error('This operation is only available from the application window.');
 return runtime;
}
function registerRuntime(runtime){
 runtimes.set(runtime.window.webContents.id,runtime);lastFocused=runtime;
 for(const channel of [...runtime.handlers.keys(),...runtime.immediateHandlers.keys()]){
  if(registeredChannels.has(channel))continue;registeredChannels.add(channel);
  ipcMain.handle(channel,(event,...args)=>{
   const owner=senderRuntime(event);
   if(owner.immediateHandlers.has(channel)&&owner.useImmediateHandler?.(channel)!==false)return owner.immediateHandlers.get(channel)(event,...args);
   // The shared queue preserves filesystem and preference transaction ordering.
   // Tree reads capture their tree before their first await, then release the
   // queue so queued navigation/close can abort them. Mutations stay serialized.
   // Window authority remains in its closure across every asynchronous boundary.
   // Count accepted work immediately, including time queued behind other windows.
   pendingOperations.set(owner,(pendingOperations.get(owner)||0)+1);
   const operation=operationQueue.schedule(()=>{if(senderRuntime(event)!==owner)throw Error('Application window changed.');return owner.handlers.get(channel)(...args);},{detach:detachedTreeReads.has(channel)}).finally(()=>pendingOperations.set(owner,pendingOperations.get(owner)-1));
   return operation;
  });
 }
}
function checkAlignmentRename(oldPath,newPath){for(const runtime of runtimes.values())runtime.checkAlignmentRename(oldPath,newPath);}
function remapRenamedContexts(origin,oldPath,newPath){let result=[];for(const runtime of runtimes.values()){const updates=runtime.remapRenamedContexts(oldPath,newPath);if(runtime.window===origin)result=updates;else if(updates.length&&!runtime.window.isDestroyed())runtime.window.webContents.send('contexts:remapped',updates);}return result;}
app.on('before-quit',event=>{if([...runtimes.values()].some(runtimeBusy))event.preventDefault();});
function dependencies(){return {
 scheduleRuntimeCommit:work=>operationQueue.schedule(work),pdfTextService:pdfTextAdapter,
process,app,dialog,shell,clipboard,fs,path,randomUUID,FolderService,readFolderTextReport,dataOpenDialog,validateArchiveExtraction,extractArchiveEntries,BatchService,readFolderProperties,readFolderSize,ThreeWayFolders,ThreeWayRecovery,FolderTree,FolderAlignment,MappedFolderOperations,UpdateBothOperations,previewCopyToFolder,previewMove,previewFilteredMove,previewFilteredDelete,previewFilteredCopyToFolder,stageFolderPair,shellIntegration,finderIntegration,validateEditorSettings,normalizeSettingsTransfer,readSettingsTransfer,writeSettingsTransfer,captureSessionDefaults,setFolderModified,execFileAsync,createSnapshot,saveSnapshot,loadSnapshot,compareSnapshots,validateSession,readLimited,stageSession,MAX_TEXT_BYTES,MAX_SESSION_BYTES,TYPES,decodeData,readDataLimited,readTextLimited,encodeText,decodeText,validateFormat,detectLineEnding,validateWorkspace,stageWorkspace,writeWorkspace,setSessionLocked,writeSession,applyTransferredPreferences,entryURL,externalEditor,sessionDefaults,sftpProfiles,sftpKnownHosts,fileActionHistory,folderNavigation,shellRequests,shortcutState,buildApplicationMenu,
 get shortcutOverrides(){return shortcutOverrides;},set shortcutOverrides(value){shortcutOverrides=value;},get shortcutStore(){return shortcutStore;},get shortcutCatalog(){return shortcutCatalog;},
 createWindow,isShellRecipient:window=>focusedRuntime()?.window===window,checkAlignmentRename,remapRenamedContexts
};}
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    title: 'Further Compare',
    backgroundColor: '#f7f8f5',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false
    }
  });
  const runtime=createWindowRuntime(mainWindow,dependencies()),webContentsId=mainWindow.webContents.id;registerRuntime(runtime);
  mainWindow.on('focus',()=>{lastFocused=runtime;});
  mainWindow.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  mainWindow.on('close', event => { if(runtimeBusy(runtime))event.preventDefault(); });
  mainWindow.webContents.on('will-prevent-unload', event => {
    const response = dialog.showMessageBoxSync(mainWindow, {
      type:'warning', title:'Unsaved session', message:'Discard changes and close?',
      detail:'Choose Cancel to keep working. You can save your session from the Session menu.',
      buttons:['Cancel','Discard and close'], defaultId:0, cancelId:0, noLink:true
    });
    // Electron uses preventDefault here to override the renderer's unload veto.
    if (response === 1) event.preventDefault();
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== entryURL) event.preventDefault();
  });
  mainWindow.webContents.on('will-redirect', event => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed',()=>{runtimes.delete(webContentsId);if(lastFocused===runtime)lastFocused=null;runtime.dispose();});
  mainWindow.loadFile(entryPath).catch(error => {
    console.error('Unable to open Further Compare:', error.message);
    if(!mainWindow.isDestroyed())mainWindow.destroy();
  });

  if (process.env.FC_SMOKE === '1') {
    const timeout = setTimeout(() => {
      console.error('Desktop smoke test timed out.');
      app.exit(1);
    }, 20000);
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const result = await mainWindow.webContents.executeJavaScript(`(async () => {
          document.getElementById('sample').click();
          await new Promise((resolve, reject) => {
            const deadline = setTimeout(() => { observer.disconnect(); reject(new Error('Sample comparison worker did not finish.')); }, 10000);
            const observer = new MutationObserver(() => {
              if (Number(document.getElementById('changeCount').textContent) > 0) {
                observer.disconnect(); clearTimeout(deadline); resolve();
              }
            });
            observer.observe(document.getElementById('changeCount'), {childList: true, subtree: true});
          });
          return {
            title: document.title,
            bridge: typeof window.desktop?.scanFolders === 'function',
            content: document.body.innerText.length,
            sampleChanges: Number(document.getElementById('changeCount').textContent),
            nodeIsolated: typeof require === 'undefined' && typeof process === 'undefined'
          };
        })()`);
        console.log('FC_SMOKE', JSON.stringify(result));
        clearTimeout(timeout);
        app.exit(result.bridge && result.nodeIsolated && result.content > 20 && result.sampleChanges > 0 ? 0 : 1);
      } catch (error) {
        clearTimeout(timeout);
        console.error(error);
        app.exit(1);
      }
    });
  }
  return mainWindow;
}

function buildApplicationMenu(){
  const catalog=new Map(),seen=new Set();
  const action = (label, id, accelerator='') => {
    if(!catalog.has(id))catalog.set(id,{id,label,accelerator});
    const binding=seen.has(id)?'':Object.hasOwn(shortcutOverrides,id)?shortcutOverrides[id]:accelerator;seen.add(id);
    return {id,label,...(binding?{accelerator:binding}:{}),click:()=>{if(id==='new-window')createWindow();else focusedRuntime()?.window.webContents.send('menu-action',id);}};
  };
  // Standard editing bindings are fixed, reserved shortcuts. The renderer
  // chooses comparison history only in its editor context, otherwise native undo.
  const editHistory=(label,id,accelerator)=>({id,label,accelerator,click:()=>focusedRuntime()?.window.webContents.send('menu-action',id)});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{role: 'appMenu'}] : []),
    {label:'Session',submenu:[action('New Window','new-window','CmdOrCtrl+Shift+N'),{type:'separator'},
      ...TYPES.map(type => action(type === 'folder-merge3' ? 'New Three-way Folder Merge' : `New ${type.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')}`, `new:${type}`)),
      {type:'separator'}, action('Open Workspace…','open-workspace'),action('Save Workspace As…','save-workspace'),{type:'separator'}, action('Open Session…','open-session','CmdOrCtrl+O'),
      action('Save Session','save-session','CmdOrCtrl+S'), action('Save Session As…','save-session-as','CmdOrCtrl+Shift+S'),action('Lock Saved Session','lock-session'),action('Unlock Saved Session','unlock-session'),
      {type:'separator'},action('Compare Parent Folders','compare-parent-folders'),action('Clear Session…','clear-session'), action('Close Session','close-session'),action('Close Other Sessions','close-other-sessions')
    ]},
    {label:'File',submenu:[action('Apply Patch…','text:apply-patch'),action('Export Patch…','text:export-patch'),action('Batch Comparisons…','batch:open'),action('File Manager Integration…','shell:setup'),action('External Editor…','editor:settings'),action('Import / Export Settings…','settings:transfer'),action('Session Defaults…','session:defaults'),action('Keyboard Shortcuts…','keyboard:settings'),{type:'separator'},action('Open Left…','open-a','CmdOrCtrl+Alt+O'),action('Open Right…','open-b','CmdOrCtrl+Alt+Shift+O'),
      action('Open Left in External Editor','editor:left'),action('Open Right in External Editor','editor:right'),action('Save Left As…','save-a'),action('Save Right As…','save-b'),action('Save Left to Server…','save-server-a'),action('Save Right to Server…','save-server-b'),action('Reload Files','reload','CmdOrCtrl+R'),
      {label:'Archive Entry',submenu:[action('Apply Left to Parent Archive…','archive:apply-entry-left'),action('Apply Right to Parent Archive…','archive:apply-entry-right'),action('Return to Parent Archive','archive:back-to-parent')]},
      {type:'separator'},action('Save Left Folder Snapshot…','snapshot-save-left'),action('Save Right Folder Snapshot…','snapshot-save-right'),action('Compare Folder Snapshots…','snapshot-compare'),
      {type:'separator'},{role:process.platform === 'darwin' ? 'close' : 'quit'}]},
    {label:'Actions',submenu:[action('Apply Patch to Folder…','folder:apply-patch'),action('Compare Now','compare-now','CmdOrCtrl+Enter'),{label:'Synchronize',submenu:[action('Update Left…','folder:update-left'),action('Update Right…','folder:update-right'),action('Update Both Sides…','folder:update-both'),{type:'separator'},action('Mirror to Left…','folder:mirror-left'),action('Mirror to Right…','folder:mirror-right')]},action('Open Selected','folder:open'),action('Compare Selected Pair','folder:compare-pair'),action('Align Selected Pair','folder:align-pair'),action('Clear Folder Alignment','folder:clear-alignment'),{label:'Open As',submenu:[['text-compare','Text'],['binary-compare','Binary'],['table-compare','Table'],['picture-compare','Picture'],['audio-compare','Audio'],['archive-compare','Archive'],['registry-compare','Registry']].map(([mode,label])=>action(label+' Comparison','folder:open-as-'+mode))},action('Open in External Editor','folder:external-editor'),action('Compare Visible Contents','folder:refresh'),action('Refresh Selected','folder:refresh-selected'),action('Compare Selected Folder Node','folder:compare-node'),action('Compare Selected Files','folder:compare-selected'),action('Quick Comparison…','folder:quick-compare'),{type:'separator'},action('Copy Left to Right','copy-right'),action('Copy Right to Left','copy-left'),action('Copy to Folder…','folder:copy-to-folder'),action('Move Left to Right','folder:move-right'),action('Move Right to Left','folder:move-left'),action('Move to Folder…','folder:move-to-folder'),action('Delete Selected…','folder:delete'),action('Rename File or Folder…','folder:rename'),action('New Folder…','folder:new-folder'),action('New File…','folder:new-file'),action('View Properties…','folder:properties'),action('Change Attributes…','folder:attributes'),action('Change Modified Time…','folder:modified-time'),action('Reveal in File Manager','folder:reveal'),action('Copy Paths','folder:copy-paths'),action('Copy Relative Paths','folder:copy-relative-paths'),action('Copy Filenames','folder:copy-names'),{type:'separator'},action('Select All','folder:select-all'),action('Select Files on Focused Side','folder:select-files'),action('Select Files on Both Sides','folder:select-files-both'),action('Clear Selection','folder:clear-selection'),action('Invert Selection','folder:select-invert'),{label:'Select by',submenu:[action('Newer on Both Sides','folder:select-newer-both'),action('One-sided on Both Sides','folder:select-one-sided-both'),action('Changed','folder:select-changed'),action('Matching Files (Current Rules)','folder:select-matching'),action('Left Only','folder:select-left-only'),action('Right Only','folder:select-right-only'),action('Newer on Left','folder:select-newer-left'),action('Newer on Right','folder:select-newer-right')]},action('Ignore Selected Differences','folder:ignore-selected'),action('Restore Selected Differences','folder:restore-selected'),action('Restore All Ignored Differences','folder:restore-all'),action('Exclude Selected','folder:exclude-selected'),action('Exclude File Types…','folder:exclude-types'),action('Reset File Masks','folder:reset-masks'),action('Expand Selected Folder','folder:expand'),action('Collapse Selected Folder','folder:collapse'),action('Collapse All','folder:collapse-all'),action('Expand Subtree','folder:expand-subtree'),action('Collapse Subtree','folder:collapse-subtree'),action('Expand All','folder:expand-all'),action('Stop Expanding','folder:stop')]},
    {label:'Edit',submenu:[action('Undo Comparison Edit','undo','CmdOrCtrl+Alt+Z'),action('Redo Comparison Edit','redo','CmdOrCtrl+Alt+Shift+Z'),action('Copy Section Left to Right','copy-right'),action('Copy Section Right to Left','copy-left'),action('Swap Sides','swap'),{type:'separator'},
      action('Compare Clipboard in New Session','clipboard:compare-new'),action('Paste Clipboard to Left','clipboard:paste-left'),action('Paste Clipboard to Right','clipboard:paste-right'),{type:'separator'},
      action('Find…','text:find','CmdOrCtrl+F'),action('Find Next','text:find-next','CmdOrCtrl+G'),action('Find Previous','text:find-previous','CmdOrCtrl+Shift+G'),action('Go to Line…','text:go-line','CmdOrCtrl+L'),{type:'separator'},action('Toggle Bookmark','text:bookmark-toggle'),action('Next Bookmark','text:bookmark-next'),action('Previous Bookmark','text:bookmark-previous'),action('Copy Selected Lines Across','text:copy-lines'),{type:'separator'},editHistory('Undo','edit:undo','CmdOrCtrl+Z'),editHistory('Redo','edit:redo','CmdOrCtrl+Shift+Z'),...(process.platform==='darwin'?[]:[{...editHistory('Redo (Ctrl+Y)','edit:redo','Ctrl+Y'),id:'edit:redo-alternate',visible:false,acceleratorWorksWhenHidden:true}]),{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'Search',submenu:[action('Find Filename…','folder:find-name'),action('Next Filename Match','folder:find-next-name'),action('Previous Filename Match','folder:find-previous-name')]},
    {label:'View',submenu:[action('Folder Filters & Options…','folder:options'),action('Toggle Minor Text Differences','text:show-minor'),action('Align Text Lines…','alignment'),action('Folder Comparison Report…','folder:report'),action('Selected Entries Report…','folder:report-selected'),action('Text File Report…','folder:text-report'),action('File Action History…','folder:operation-history'),action('Folder Filename Filters…','folder:filters'),action('Show Hidden / Restore Filters','folder:suppress-filters'),action('Always Show Folders','folder:always-show-folders'),action('Show / Hide Folder Color Legend','folder:toggle-legend'),{label:'Folder Comparison',submenu:[action('File Contents','folder:rules-content'),action('Text — Preserve Case and Spaces','folder:rules-text-content'),action('Text — Ignore Whitespace','folder:rules-text-whitespace'),action('Text — Ignore Case','folder:rules-text-case'),action('Text — Ignore Case and Whitespace','folder:rules-text-whitespace-case'),action('Size Only','folder:rules-size'),action('Modified Time Only','folder:rules-modified'),action('Size and Modified Time','folder:rules-size-modified'),{type:'separator'},action('Text Encoding…','folder:text-encoding'),action('Timestamp Tolerance…','folder:tolerance'),action('Filename Matching…','folder:name-options'),action('Timestamp Options…','folder:timestamp-options'),action('Unix Metadata…','folder:metadata-options'),action('Automatic Refresh…','folder:auto-refresh')]},{label:'Folder Navigation',submenu:[action('Back (Focused Side)','folder:navigate-back'),action('Forward (Focused Side)','folder:navigate-forward'),action('Parent Folder (Focused Side)','folder:navigate-parent'),action('Parent Folders (Both Sides)','folder:navigate-parents')]},action('Back to Parent Folder Session','session:back-to-folder','Alt+Left'),{label:'Folder Layout',submenu:[action('Tree','folder:view-tree'),action('Loaded Files','folder:view-flat'),action('All Files (Recursive)','folder:view-recursive'),action('Match Filenames Across Folders','folder:view-filename'),{type:'separator'},action('Reset Column Widths','folder:columns-reset')]},{label:'Folder Display',submenu:FOLDER_FILTERS.map(([value,label])=>action(label[0].toUpperCase()+label.slice(1),'filter:'+value))},{label:'Folder Sort',submenu:[action('Name','folder:sort-name'),action('Path','folder:sort-path'),action('Left Size','folder:sort-size-left'),action('Right Size','folder:sort-size-right'),action('Left Modified','folder:sort-modified-left'),action('Right Modified','folder:sort-modified-right'),action('Reverse Order','folder:sort-reverse')]},action('Display Preferences…','appearance','CmdOrCtrl+,'),{type:'separator'},action('Next Section','next','Alt+Down'),action('Previous Section','previous','Alt+Up'),{type:'separator'},...['all','diff','same','context'].map(filter => action(filter === 'diff' ? 'Differences' : filter[0].toUpperCase()+filter.slice(1),`filter:${filter}`)),
      {type:'separator'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
    {role:'windowMenu'}
  ]));
  shortcutCatalog=[...catalog.values()];
}

if (primaryInstance) app.whenReady().then(async () => {
  app.on('will-quit',()=>pdfTextService?.dispose());
  folderNavigation = new FolderNavigation(path.join(app.getPath('userData'), 'folder-history.json'));
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  buildApplicationMenu();
  shortcutStore=new KeyboardShortcuts(path.join(app.getPath('userData'),'keyboard-shortcuts.json'),shortcutCatalog,process.platform);
  try{shortcutOverrides=await shortcutStore.get();}catch(error){console.error('Could not load keyboard shortcuts:',error.message);}
  buildApplicationMenu();
  shellReady = true;
  // macOS can emit activate before ready during a Finder/Dock launch.
  // Register only after services and IPC are initialized; initial startup
  // creates its own window even if an earlier activation was missed.
  app.on('activate', () => {
    if (runtimes.size === 0) createWindow();
  });
  createWindow();
}).catch(error => { console.error(error); app.exit(1); });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
