import {createTextGrammarDialog} from './text-grammar-ui.js';
import {validateTextGrammar,hasTextGrammar} from './text-grammar.cjs';
import {createTextProfileMappingsDialog} from './text-profile-mappings-ui.js';
import {validateTextProfile,validateTextProfileMappings} from './text-profile.cjs';
import {validateIgnoredTextPatterns} from './ignored-text-rules.cjs';
import {createIgnoredTextDialog} from './ignored-text-dialog.js';
import whitespaceRules from './text-whitespace.cjs';
const {WHITESPACE_SCOPES}=whitespaceRules;
const whitespaceScopeLabel=scope=>({all:'whitespace',horizontal:'spaces/tabs',leading:'leading spaces/tabs',trailing:'trailing spaces/tabs',edges:'leading and trailing spaces/tabs',embedded:'embedded spaces/tabs','leading-embedded':'leading and embedded spaces/tabs','trailing-embedded':'trailing and embedded spaces/tabs'})[scope]||'whitespace';
import {validateFolderNameRules} from './folder-name-rules.cjs';
import {createFolderRefreshSchedule} from './folder-refresh.cjs';
import {validateRefreshInterval} from './folder-refresh.cjs';
import {folderEncodings,folderEncodingFields} from './folder-encoding.cjs';
import {createFolderEncodingDialog,folderEncodingName} from './folder-encoding-dialog.js';
import {createFolderAttributesDialog} from './folder-attributes-ui.js';
import {createFolderPatchDialog} from './folder-patch-ui.js';
import {createSftpConnectionDialog} from './sftp-connection-dialog.js';
import {createTextPatchApplyDialog} from './text-patch-apply-ui.js';
import {createTextPatchDialog} from './text-patch-ui.js';
import {createFolderQuickCompare} from './folder-quick-compare.js';
import {createFolderOperationHistory} from './folder-operation-history.js';
import {createFilenameSearchDialog} from './filename-search-dialog.js';
import {runFilenameSearch} from './filename-search-client.js';
import {FOLDER_FILTERS,FOLDER_FILTER_IDS} from '../desktop/folder-display.cjs';
import {createBatchDialog} from './batch-dialog.js';
import {createFolderColumns} from './folder-columns.js';
import {createFolderToleranceDialog} from './folder-tolerance-dialog.js';
import {createFolderTypeExclusionDialog} from './folder-type-exclusion-dialog.js';
import {addIgnoredRows,removeIgnoredRows,pruneIgnoredMarks,projectIgnoredRows} from './folder-ignored.cjs';
import {fileTypeMasks,appendTypeMasks} from './folder-type-exclusions.cjs';
import {createFolderFilterDialog} from './folder-filter-dialog.js';
import {createContextMenu} from './context-menu.js';
import {createFolderModifiedDialog} from './folder-modified-dialog.js';
import {createFolderPropertiesDialog} from './folder-properties-dialog.js';
import {createExternalEditorSettings} from './external-editor-settings.js';
import {createShellSetup} from './shell-setup.js';
import {createTextAlignment} from './text-alignment.js';
import {createFileContentReportDialog} from './file-content-report-ui.js';
import {createFolderReportDialog} from './folder-report-ui.js';
import {walkFolders} from './folder-walk.cjs';
import engine from './diff.cjs';
import {decodeText,encodeText,validateFormat,detectLineEnding,ENCODINGS} from './text-codec.cjs';
import {decodeTextInput as decodeDocumentInput,isDocumentInput} from './text-input.cjs';
import {extractPdfTextInBrowser} from './pdf-text-browser.js';
import {extractDocTextInBrowser} from './doc-text-browser.js';
const decodeTextInput=(bytes,name,encoding='auto',options={})=>decodeDocumentInput(bytes,name,encoding,{extractPdfText:extractPdfTextInBrowser,extractDocText:extractDocTextInBrowser,...options});
const pdfReadOptions=side=>({pdfOrder:$('pdfOrder'+side.toUpperCase()).value,docxScope:$('docxScope'+side.toUpperCase()).value,odtScope:$('odtScope'+side.toUpperCase()).value,docScope:$('docScope'+side.toUpperCase()).value});
import {validateDocumentProjection} from './document-projection.cjs';
import {projectText} from './text-format.cjs';
import {createArchiveCompare} from './archive-compare.js';
import {createRegistryCompare} from './registry-compare.js';
import {createDisplaySettings} from './display-settings.js';
import {createSettingsTransfer} from './settings-transfer-ui.js';
import {createSessionDefaults} from './session-defaults-ui.js';
import {createKeyboardShortcuts} from './keyboard-shortcuts-ui.js';
import {createAdvanced} from './advanced.js';
import {mountFolderThreeWay} from './folder-threeway-ui.js';
import {createThreeWayReportDialog} from './folder-threeway-report-ui.js';
import {createPictureCompare} from './picture-compare.js';
import {createMediaCompare} from './media-compare.js';
import {inlineDiff} from './inline-diff.cjs';
import {filterRows} from './view.cjs';
import {createTextTools} from './text-tools.js';
import {createLiveTextDiff} from './live-text-diff.js';
import {createCompactTextLayout} from './compact-text-layout.js';
import {createCompactFolderLayout} from './compact-folder-layout.js';
import {filterEntries,selectEntries,createFolderSummaryCache,appendExcludedPaths} from './folder-view.cjs';
const $=id=>document.getElementById(id), desktop=window.desktop;
const maxBytes=desktop?10*1024*1024:2*1024*1024,maxLines=desktop?150000:30000;
const types=['text-compare','text-merge','folder-compare','folder-merge','folder-sync','binary-compare','table-compare','picture-compare','text-merge3','audio-compare','archive-compare','registry-compare','folder-merge3'];
const remoteTextSources=new Map();
let type='text-compare', filter='all', dirty=false, savedPath='', sessionLocked=false, files={a:{name:'',path:''},b:{name:'',path:''}}, folders={a:null,b:null};
let textGrammar=validateTextGrammar(),textProfileMappings=[],ignoredTextPatterns=[],workerTimer=null;
const textGrammarDialog=createTextGrammarDialog();
const textProfileMappingsDialog=createTextProfileMappingsDialog();
const ignoredTextDialog=createIgnoredTextDialog();
let sources={a:null,b:null}, result=null, viewRows=[], revision=0, worker=null, selectedHunk=0, undo=[], redo=[], frame=0, noticeTimer;
let viewEpoch=0,archiveEntryLink=null;
let activeId=null,tabs=new Map(),folderRelative='',expandedFolders=new Set(),sideSelection={a:new Set(),b:new Set()},autoTimer,localEdits={a:false,b:false},changeWarned=false;
let folderTreeRevision=null,folderAlignmentPairs=[],folderNameRules={};
let folderIgnoredMarks=[];
let folderRows=[], selection=new Set(), folderDifferenceId=null, plan=null, pendingGuard=null, operation=false;
const isAdvanced=()=>['binary-compare','table-compare','picture-compare','text-merge3','audio-compare','archive-compare','registry-compare','folder-merge3'].includes(type);
const dataEditor=createAdvanced({host:$('dataWorkspace'),desktop,notify,onDirty:()=>markDirty(),onInputReplaced:side=>invalidateArchiveEntrySide(side),renderToolbarActions:renderArchiveEntryActions});
const pictureEditor=createPictureCompare({host:$('pictureWorkspace'),desktop,notify,onDirty:()=>markDirty()});
const mediaEditor=createMediaCompare({host:$('mediaWorkspace'),desktop,notify,onDirty:()=>markDirty()});
const archiveEditor=createArchiveCompare({host:$('archiveWorkspace'),desktop,notify,onDirty:()=>markDirty(),onOpenEntry:out=>run(()=>openDataComparison(out,activeId))});
const registryEditor=createRegistryCompare({host:$('registryWorkspace'),desktop,notify,onDirty:()=>markDirty(),onInputReplaced:side=>invalidateArchiveEntrySide(side),renderToolbarActions:renderArchiveEntryActions});
const threeWayEditor=mountFolderThreeWay($('folderThreeWayWorkspace'),{desktop,onDirty:()=>markDirty(),run:fn=>run(fn),onReport:()=>threeWayReport.open()});
const threeWayReport=createThreeWayReportDialog({readSnapshot:()=>({...threeWayEditor.getState(),name:$('sessionName').value}),download,notify});
const dedicatedEditors={'picture-compare':pictureEditor,'audio-compare':mediaEditor,'archive-compare':archiveEditor,'registry-compare':registryEditor,'folder-merge3':threeWayEditor};
const currentEditor=()=>dedicatedEditors[type]||dataEditor;
const inlineSpans=new WeakMap();
const isFolder=()=>type.startsWith('folder-')&&type!=='folder-merge3',isMerge=()=>type==='text-merge';
const defaultFormat=()=>({encoding:'utf8',bom:false,lineEnding:'none'});
let textAlignment=[];
let rawText={a:'',b:''},textFormats={a:defaultFormat(),b:defaultFormat()};
const normalizeText=text=>text.replace(/\r\n?/g,'\n');
function setArea(side,text,format=null){if(normalizeText(rawText[side])!==normalizeText(text))clearAlignment();rawText[side]=text;$('text'+side.toUpperCase()).value=text;textFormats[side]=format?validateFormat(format):{...textFormats[side],lineEnding:detectLineEnding(text)};}
function texts(){const value={};for(const side of ['a','b']){const policy=detectLineEnding(rawText[side])==='none'&&['lf','crlf','cr'].includes(textFormats[side].lineEnding)?textFormats[side].lineEnding:'preserve';value[side]=projectText(rawText[side],$('text'+side.toUpperCase()).value,policy);if(normalizeText(rawText[side])!==normalizeText(value[side]))clearAlignment();rawText[side]=value[side];const actual=detectLineEnding(value[side]);if(actual!=='none'||!['lf','crlf','cr'].includes(textFormats[side].lineEnding))textFormats[side].lineEnding=actual;}return value;}
function clearAlignment(){if(textAlignment.length){textAlignment=[];notify('Manual alignment cleared because the text changed.');}alignment.reset();}
const alignment=createTextAlignment({getText:()=>({a:normalizeText($('textA').value),b:normalizeText($('textB').value)}),getAnchors:()=>textAlignment,notify,apply:pairs=>{const raw=texts();const next=engine.validateAnchors(pairs,normalizeText(raw.a),normalizeText(raw.b));pushHistory(undo,raw);redo=[];textAlignment=next;invalidate();markDirty();compute(true);}});
function openAlignment(){if(!activeId||isFolder()||isAdvanced())return;$('textOptionsDialog')?.close();alignment.open();}
function historyText(){try{return texts();}catch{return {...rawText,pendingViews:{a:$('textA').value,b:$('textB').value}};}}
function formatControls(){for(const side of ['a','b']){const cap=side.toUpperCase(),format=textFormats[side];$('encoding'+cap).value=format.encoding;$('normalizeLegacyLabel'+cap).hidden=!format.legacyBytes;$('normalizeLegacy'+cap).checked=format.normalizeLegacy===true;$('bom'+cap).checked=format.bom;$('bom'+cap).disabled=!['utf8','utf16le','utf16be','utf32le','utf32be'].includes(format.encoding);$('eol'+cap).value=format.lineEnding;$('readEncoding'+cap).disabled=!!files[side].documentProjection;$('reopenEncoding'+cap).disabled=!!files[side].documentProjection||(!files[side].path&&!sources[side]);const docx=files[side].documentProjection?.kind==='docx';$('reextractDocx'+cap).hidden=!docx;$('reextractDocx'+cap).disabled=!docx||(!files[side].path&&!sources[side]);$('reextractDocx'+cap).title='Replace extracted text using the selected logical scope. Related text includes referenced headers, footers and notes, not rendered pages. Reopen the source if this session retains extracted text only.';const odt=files[side].documentProjection?.kind==='odt';$('reextractOdt'+cap).hidden=!odt;$('reextractOdt'+cap).disabled=!odt||(!files[side].path&&!sources[side]);$('reextractOdt'+cap).title='Replace extracted text using the selected logical scope. Related text includes referenced headers, footers and notes, not rendered pages. Reopen the source if this session retains extracted text only.';const doc=files[side].documentProjection?.kind==='doc';$('reextractDoc'+cap).hidden=!doc;$('reextractDoc'+cap).disabled=!doc||(!files[side].path&&!sources[side]);$('reextractDoc'+cap).title='Replace extracted text using the selected logical scope. Related text includes stored headers, footers, notes, comments and text boxes, not rendered pages. Reopen the source if this session retains extracted text only.';const pdf=files[side].documentProjection?.kind==='pdf';$('reextractPdf'+cap).hidden=!pdf;$('reextractPdf'+cap).disabled=!pdf||(!files[side].path&&!sources[side]);$('reextractPdf'+cap).title=pdf&&!files[side].path&&!sources[side]?'Reopen the source PDF to change its reading order. This session retains extracted text only.':'Re-extract this PDF using the selected reading order. Page rows and columns use geometric positions. Tagged structure orders normalized extracted text within each page and keeps artifacts in a labelled tail; it does not reconstruct whole-document reading order or original whitespace.';}}
function changeTextFormat(side){const cap=side.toUpperCase(),eol=$('eol'+cap).value;let before;try{before=texts();}catch(error){if(!['lf','crlf','cr'].includes(eol))throw error;before={...rawText,pendingViews:{a:$('textA').value,b:$('textB').value}};}pushHistory(undo,before);redo=[];const encoding=$('encoding'+cap).value,bom=['utf8','utf16le','utf16be','utf32le','utf32be'].includes(encoding)&&$('bom'+cap).checked;const input=before.pendingViews?.[side]??normalizeText(before[side]);setArea(side,['lf','crlf','cr'].includes(eol)?projectText(before[side],input,eol):before[side],{...(encoding===textFormats[side].encoding&&textFormats[side].legacyBytes?{legacyBytes:textFormats[side].legacyBytes,...($('normalizeLegacy'+cap).checked?{normalizeLegacy:true}:{})}:{}),encoding,bom,lineEnding:eol});localEdits[side]=true;invalidate();markDirty();compute(true,!$('comparisonView').hidden);}
let workspaceInputLocked=false;
async function lockedWorkspaceInput(action,{allowNavigation=true}={}){
 if(workspaceInputLocked)throw Error('Wait for the current workspace change to finish.');
 workspaceInputLocked=true;textTools.cancelPendingEdits?.();
 const nodes=allowNavigation?[...new Set([...document.body.children].filter(node=>node.tagName!=='MAIN').concat([...document.querySelector('main').children].filter(node=>!node.classList.contains('tab-strip')),[...document.querySelectorAll('dialog[open]')]))]:[document.body,...document.querySelectorAll('dialog[open]')];
 const previous=nodes.map(node=>node.inert),focus=document.activeElement;
 const blockInput=event=>{if(allowNavigation&&event.type==='keydown'&&event.target.closest?.('.tab-strip')&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.isComposing&&['Tab','Enter',' ','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();};
 for(const event of ['keydown','beforeinput','cancel','contextmenu'])document.addEventListener(event,blockInput,true);
 for(const node of nodes)node.inert=true;
 try{return await action();}finally{for(const event of ['keydown','beforeinput','cancel','contextmenu'])document.removeEventListener(event,blockInput,true);nodes.forEach((node,index)=>node.inert=previous[index]);workspaceInputLocked=false;const active=document.activeElement;if(focus?.isConnected&&(active===document.body||nodes.some(node=>node.contains(active))))focus.focus({preventScroll:true});}
}
const lockedDocumentRead=action=>lockedWorkspaceInput(action,{allowNavigation:false});
async function reextractDocument(side,kind){
 const file=files[side],source=sources[side],id=activeId,options=pdfReadOptions(side),policy=kind==='pdf'?options.pdfOrder:options[kind+'Scope'];
 if(file.documentProjection?.kind!==kind)throw Error('Open a '+kind.toUpperCase()+' before re-extracting.');
 if(!file.path&&!source)throw Error('Reopen the source '+kind.toUpperCase()+' to change its reading policy.');
 if(kind!=='pdf'&&!window.confirm('Re-extract this '+kind.toUpperCase()+' using the selected scope? This replaces its extracted draft. The original document stays unchanged.'))return;
 if(!await guard('Save session changes before replacing this '+kind.toUpperCase()+'’s extracted text?'))return;
 if(id!==activeId||file!==files[side]||source!==sources[side])return;
 // Native reload commits its projection before IPC returns. Lock every editor,
 // policy control, modal and menu command until both native and UI commit.
 await lockedDocumentRead(async()=>{
  const readOptions=kind==='pdf'?{pdfOrder:policy}:{[kind+'Scope']:policy};
  const data=desktop&&file.path?await desktop.reloadText(side,'auto',readOptions):{...file,...await decodeTextInput(new Uint8Array(await source.arrayBuffer()),source.name,'auto',readOptions)};
  if(id!==activeId||file!==files[side]||source!==sources[side])return;
  if(data)setLoaded(side,data,source);
 });
}
const reextractPdf=side=>reextractDocument(side,'pdf');
const reextractDocx=side=>reextractDocument(side,'docx');
const reextractOdt=side=>reextractDocument(side,'odt');
const reextractDoc=side=>reextractDocument(side,'doc');

async function reopenEncoding(side){if(files[side].documentProjection)throw Error('Document text is extracted from its source structure. Use Reload to extract it again.');const encoding=$('readEncoding'+side.toUpperCase()).value;if(!await guard('Save session changes before reopening this file with a different encoding?'))return;const data=desktop&&files[side].path?await desktop.reloadText(side,encoding):sources[side]?{...decodeText(new Uint8Array(await sources[side].arrayBuffer()),encoding),...files[side]}:null;if(data)setLoaded(side,data,sources[side]);}

const textTools=createTextTools({onCopyLines:(side,physicalLines)=>{if(workspaceInputLocked||operation||!result){notify('Wait for the current comparison to finish before copying lines.');return;}const selected=liveTextDiff.getSelection(side);merge(side,selectedHunk,selected.length?selected:physicalLines);},validateOutput:validate,host:$('textTools'),areas:{a:$('textA'),b:$('textB')},notify,onBeforeEdit:()=>{pushHistory(undo,historyText());redo=[];},onEdit:side=>{clearAlignment();localEdits[side]=true;invalidate();markDirty();scheduleCompare(false);}});
const liveTextDiff=createLiveTextDiff({areas:{a:$('textA'),b:$('textB')},onHunk:index=>{selectedHunk=index;navigation();refreshLiveText();},onLinePick:(side,index)=>{alignment.pick(side,index);refreshLiveText();},onCopy:(side,hunk,lines)=>{if(operation)return;try{merge(side,hunk,lines);}catch(error){notify(error.message,true);}}});
createCompactTextLayout();
const compactFolderLayout=createCompactFolderLayout();
const archiveEntryDialog=document.createElement('dialog');archiveEntryDialog.id='archiveEntryEditDialog';archiveEntryDialog.className='text-options-dialog';archiveEntryDialog.setAttribute('aria-labelledby','archiveEntryEditTitle');archiveEntryDialog.innerHTML='<header><h2 id="archiveEntryEditTitle">Update archive entry</h2></header><p data-summary style="white-space:pre-wrap;overflow-wrap:anywhere"></p><p>Applies to the open archive in memory. Use Save archive in the archive tab to export your changes. Archive Undo can reverse this edit.</p><p data-error role="alert"></p><footer><button type="button" class="button" data-cancel>Cancel</button><button type="button" class="button primary" data-apply>Apply in memory</button></footer>';document.body.append(archiveEntryDialog);for(const paragraph of archiveEntryDialog.querySelectorAll('p'))paragraph.style.color='var(--ui-muted)';archiveEntryDialog.querySelector('[data-error]').style.color='var(--ui-changed)';
let archiveEntryReview=null;
for(const side of ['a','b']){const button=document.createElement('button');button.id='applyArchiveEntry'+side.toUpperCase();button.type='button';button.className='icon-button';button.textContent='Apply to archive';button.setAttribute('aria-label','Apply '+(side==='a'?'left':'right')+' to archive');button.hidden=true;button.onclick=()=>runWhenIdle(()=>reviewArchiveEntry(side));$('save'+side.toUpperCase()).after(button);}
function archiveEntryActionDisabled(side){return !!files[side]?.documentProjection||!archiveEntryLink?.sides.includes(side)||tabs.get(archiveEntryLink?.parentId)?.data?.type!=='archive-compare';}
function renderArchiveEntryActions(editorType){
 if(!['binary-compare','table-compare','registry-compare'].includes(editorType)||type!==editorType||!archiveEntryLink)return [];
 const table=editorType==='table-compare',registry=editorType==='registry-compare',saved=table?dataEditor.getState():null;
 return ['a','b'].map(side=>{const button=document.createElement('button');button.id=(registry?'applyRegistryArchiveEntry':table?'applyTableArchiveEntry':'applyBinaryArchiveEntry')+side.toUpperCase();button.type='button';button.textContent=table||registry?'Apply result to '+(side==='a'?'left':'right')+' archive':'Apply '+(side==='a'?'left':'right')+' to archive';button.disabled=archiveEntryActionDisabled(side)||(registry&&!registryArchiveCanApply(side))||(table&&(!Array.isArray(saved.options.tableResult)||! /\.(csv|tsv|xlsx|ods)$/i.test(saved.inputs[side]?.name||'')));button.title=button.disabled?(registry?'Choose a valid result and reopen a registry entry from its archive':table?'Choose a result and reopen a CSV, TSV, XLSX or ODS entry from its archive':'Reopen this entry from its archive to apply edits'):'Review this result before updating the archive';button.onclick=()=>runWhenIdle(()=>reviewArchiveEntry(side));return button;});
}
function refreshArchiveEntryActions(){for(const side of ['a','b']){const button=$('applyArchiveEntry'+side.toUpperCase());if(!button)continue;button.hidden=!!files[side]?.documentProjection||!archiveEntryLink||!['text-compare','text-merge'].includes(type);button.disabled=archiveEntryActionDisabled(side);button.title=button.disabled?'Reopen this entry from its archive to apply edits':'Review this editor’s changes before updating the archive';}dataEditor.refreshActions();registryEditor.refreshActions();}
function registryArchiveCanApply(side){return !!archiveEntryLink&&/\.reg$/i.test(archiveEntryLink.reference.path||'')&&registryEditor.canApplyArchiveResult(side);}
function binaryArchiveSignature(side){const input=dataEditor.getState().inputs[side];return JSON.stringify(input?{name:input.name,data:input.data,diskToken:input.diskToken}:null);}
function invalidateArchiveEntrySide(side){if(!archiveEntryLink)return;archiveEntryLink={...archiveEntryLink,sides:archiveEntryLink.sides.filter(value=>value!==side)};refreshArchiveEntryActions();}
async function reviewArchiveEntry(side){
 if(files[side]?.documentProjection&&!isAdvanced())throw Error('Document projections can only be exported as text. The original archive document stays unchanged.');
 if(!['text-compare','text-merge','binary-compare','table-compare','registry-compare'].includes(type))throw Error('Open a linked archive entry before applying changes.');
 const link=archiveEntryLink,parent=tabs.get(link?.parentId);if(!link?.sides.includes(side)||parent?.data?.type!=='archive-compare')throw Error('Reopen the entry from its archive before applying changes.');
 let text,format,bytes,binarySignature,tableSignature,tableFormat,tableWorkbook,registryBinding;const binary=type==='binary-compare',table=type==='table-compare',registry=type==='registry-compare',childId=activeId,reviewType=type,reviewRevision=revision;
 if(registry){if(!registryArchiveCanApply(side))throw Error('Choose a valid result for an existing linked .reg entry.');const exported=await registryEditor.getArchiveResult(side);registryBinding=exported?.binding;if(activeId!==childId||archiveEntryLink!==link||type!==reviewType||revision!==reviewRevision||tabs.get(link.parentId)!==parent||!registryEditor.isArchiveResultCurrent(registryBinding))throw Error('The registry comparison changed. Review again.');if(typeof exported?.data!=='string'||exported.data.length>Math.ceil(32*1024*1024/3)*4)throw Error('Registry archive entry exceeds the 32 MB limit.');bytes=Uint8Array.from(atob(exported.data),c=>c.charCodeAt(0));if(bytes.byteLength>32*1024*1024)throw Error('Registry archive entry exceeds the 32 MB limit.');}
 else if(table){tableSignature=JSON.stringify(dataEditor.getState());const exported=await dataEditor.getArchiveResult(side);if(activeId!==childId||archiveEntryLink!==link||type!==reviewType||revision!==reviewRevision||tabs.get(link.parentId)!==parent||JSON.stringify(dataEditor.getState())!==tableSignature)throw Error('The comparison changed. Review again.');if(typeof exported?.data!=='string'||exported.data.length>Math.ceil(32*1024*1024/3)*4)throw Error('Table archive entry exceeds the 32 MB limit.');bytes=Uint8Array.from(atob(exported.data),c=>c.charCodeAt(0));if(bytes.byteLength>32*1024*1024)throw Error('Table archive entry exceeds the 32 MB limit.');tableFormat=exported.name.split('.').pop().toUpperCase();tableWorkbook=exported.preservedWorkbook?{side:exported.templateSide,sheet:exported.sheetName}:null;}
 else if(binary){const input=dataEditor.getState().inputs[side];if(typeof input?.data!=='string')throw Error('Open an archive entry before applying changes.');if(input.data.length>Math.ceil(32*1024*1024/3)*4)throw Error('Binary archive entry exceeds the 32 MB limit.');bytes=Uint8Array.from(atob(input.data),c=>c.charCodeAt(0));if(bytes.byteLength>32*1024*1024)throw Error('Binary archive entry exceeds the 32 MB limit.');binarySignature=binaryArchiveSignature(side);}
 else{clearTimeout(autoTimer);compute(true,false);text=texts()[side];format={...textFormats[side]};bytes=encodeText(text,format);if(bytes.byteLength>maxBytes)throw Error('Encoded archive entry exceeds the 10 MB text limit.');}
 archiveEntryReview={link,parent,childId:activeId,revision,text,format,bytes,side,binary,binarySignature,table,tableSignature,registry,registryBinding,type};archiveEntryDialog.querySelector('[data-summary]').textContent=(side==='a'?'Left':'Right')+' archive: '+(parent.data.advanced.inputs[side]?.name||'Archive')+'\nEntry: '+link.reference.path+'\nEncoded size: '+bytes.byteLength.toLocaleString()+' bytes'+(registry?'\nFormat: REG · UTF-16LE with BOM\nThe result replaces this entry with regenerated registry text, including any deletion directives. Nothing is imported into the operating-system registry.':table?'\nFormat: '+tableFormat+(['XLSX','ODS'].includes(tableFormat)?(tableWorkbook?'\nWorkbook copy from '+(tableWorkbook.side==='a'?'left':'right')+' input. Edited sheet: '+tableWorkbook.sheet+'. Other sheets, unchanged formulas and formatting are retained.'+(tableFormat==='ODS'?' Formula results may be unavailable until recalculated in a spreadsheet app.':''):'\nWorkbook preservation was not confirmed.'):'\nThe result replaces this entry with regenerated UTF-8 text.'): '');archiveEntryDialog.querySelector('[data-error]').textContent='';archiveEntryDialog.showModal();
}
archiveEntryDialog.querySelector('[data-cancel]').onclick=()=>archiveEntryDialog.close();
archiveEntryDialog.addEventListener('close',()=>{if(!archiveEntryDialog.open)archiveEntryReview=null;});
archiveEntryDialog.querySelector('[data-apply]').onclick=()=>runWhenIdle(async()=>{
 const review=archiveEntryReview;if(!review)return;const current=()=>archiveEntryDialog.open&&archiveEntryReview===review&&activeId===review.childId&&archiveEntryLink===review.link&&type===review.type&&revision===review.revision&&(review.registry?registryArchiveCanApply(review.side)&&registryEditor.isArchiveResultCurrent(review.registryBinding):review.table?JSON.stringify(dataEditor.getState())===review.tableSignature:review.binary?binaryArchiveSignature(review.side)===review.binarySignature:texts()[review.side]===review.text&&JSON.stringify(textFormats[review.side])===JSON.stringify(review.format))&&tabs.get(review.link.parentId)===review.parent;
 const button=archiveEntryDialog.querySelector('[data-apply]');button.disabled=true;try{if(!current())throw Error('The comparison changed. Cancel and review again.');const result=await archiveEditor.stageEntryEdit(review.parent.data.advanced,review.parent.archiveRuntime,review.link.reference,review.side,review.bytes);if(!current())throw Error('The comparison changed. Cancel and review again.');tabs.set(review.link.parentId,{...review.parent,data:{...review.parent.data,advanced:result.state},archiveRuntime:result.runtime,dirty:true});archiveEntryLink={...review.link,reference:result.reference};snapshot();renderTabs();archiveEntryDialog.close();notify('Archive entry updated in memory. Export ZIP from the archive tab to save it.');}catch(error){archiveEntryDialog.querySelector('[data-error]').textContent=error.message;}finally{button.disabled=false;}
});
const textPatch=createTextPatchDialog({desktop,download,notify,readSnapshot:()=>{if(!activeId||isFolder()||isAdvanced())throw Error('Open a two-way text comparison to export a patch.');const value=texts();return {left:value.a,right:value.b,leftName:files.a.name||files.a.path||'left',rightName:files.b.name||files.b.path||'right'};}});
const textPatchApply=createTextPatchApplyDialog({notify,readSnapshot:side=>{if(operation||!activeId||isFolder()||isAdvanced())throw Error('Open an idle two-way text comparison to apply a patch.');return {id:activeId,text:texts()[side]};},applyResult:({snapshot:captured,side,result:patched})=>{if(operation||activeId!==captured.id||isFolder()||isAdvanced())throw Error('The comparison changed. Preview the patch again.');const before=texts();if(before[side]!==captured.text)throw Error('The target text changed. Preview the patch again.');validate(patched);pushHistory(undo,before);redo=[];setArea(side,patched);localEdits[side]=true;changeWarned=false;invalidate();markDirty();compute(true);snapshot();}});
function refreshLiveText(){liveTextDiff.update(result,{showMinor:$('showMinor').checked,filter,selectedHunk,isPicked:(side,index)=>alignment.picked(side,index)});}
let textToolStateKey=JSON.stringify(textTools.getState());
function restoreTextTools(value){textTools.setState(value);textToolStateKey=JSON.stringify(textTools.getState());}
for(const host of ['textTools','textToolsMain'])for(const event of ['input','change','click'])$(host)?.addEventListener(event,()=>queueMicrotask(()=>{const key=JSON.stringify(textTools.getState());if(key!==textToolStateKey){textToolStateKey=key;markDirty();}}));
const bytes=n=>n==null?'—':n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
function notify(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,error?12000:6500);}
function markDirty(value=true){dirty=value;$('dirtyIndicator').hidden=!value;if(activeId&&tabs.has(activeId)){tabs.get(activeId).name=$('sessionName').value;tabs.get(activeId).dirty=value;renderTabs();}document.title=`${$('sessionName').value||'Untitled'}${value?' •':''} — Further Compare`;}
function validate(text){if(typeof text!=='string'||(desktop?text.length:new TextEncoder().encode(text).length)>maxBytes||normalizeText(text).split('\n').length>maxLines)throw Error(`Choose a text file below ${desktop?'10':'2'} MB and ${maxLines.toLocaleString()} lines.`);if(text.includes('\0'))throw Error('Choose a text file, not a binary file.');}
function metadata(){formatControls();$('folderPathNavigation').hidden=!isFolder();for(const cap of ['A','B'])$('path'+cap).readOnly=!isFolder();refreshFolderNavigation();for(const side of ['a','b']){const cap=side.toUpperCase(),text=$('text'+cap).value;$('size'+cap).textContent=`${text?text.split('\n').length.toLocaleString():0} lines · ${text.length.toLocaleString()} characters`+(files[side]?.documentProjection?' · '+files[side].documentProjection.kind.toUpperCase()+' text projection'+(files[side].documentProjection.kind==='pdf'?' · '+(files[side].documentProjection.order==='tagged-structure'?'tagged structure':files[side].documentProjection.order==='page-columns'?'page columns':files[side].documentProjection.order==='page-rows'?'page rows':'document order'):'')+' · source unchanged':'');$('size'+cap).title=files[side]?.documentProjection?'Extracted text only. Excluded: '+files[side].documentProjection.exclusions.join('; ')+'. Edits export as a separate text file.':'';$('save'+cap).title=files[side]?.documentProjection?'Export projected text as a separate text file':'Save text';const source=isFolder()?folders[side]:files[side];const shownPath=source?.remote?'sftp://'+(source.host.includes(':')?'['+source.host+']':source.host)+':'+source.port+source.path:source?.displayPath||source?.path||source?.name||'';$('path'+cap).value=shownPath;$('path'+cap).title=shownPath+(source?.disconnected?' · Disconnected — reconnect to compare':'');$('path'+cap).setAttribute('aria-description',source?.disconnected?'Saved remote folder. Disconnected. Reconnect to compare.':'');if(source?.remote)$('path'+cap).readOnly=true;$('path'+cap).placeholder=isFolder()?'Choose a folder…':'Choose a file…';$('open'+cap).title=`Open ${side==='a'?'left':'right'} ${isFolder()?'folder':'file'}`;$('open'+cap).setAttribute('aria-label',$('open'+cap).title);$('save'+cap).hidden=isFolder();const remoteSave=$('saveServer'+cap);remoteSave.hidden=isFolder()||isAdvanced()||!remoteTextSources.get(activeId)?.[side];remoteSave.disabled=operation;}}
function stopTextWorker(){clearTimeout(workerTimer);workerTimer=null;worker?.terminate();worker=null;}
function invalidate(){$('textProfileResolved').hidden=$('textProfile').value!=='auto';$('textProfileResolved').textContent='Resolving filename format…';liveTextDiff.clear();revision++;stopTextWorker();result=null;viewRows=[];$('changeCount').textContent='0';$('diffSummary').textContent='Ready';metadata();navigation();}
function showInputs(){ viewEpoch++;textTools.setEnabled(!isFolder()&&!isAdvanced());$('inputView').hidden=false;$('comparisonView').hidden=true;}
function showResults(){showInputs();refreshLiveText();}
function compute(keep=false,reveal=true){clearTimeout(autoTimer);autoTimer=null;if(isAdvanced())return;const requestedView=viewEpoch;
 if(isFolder())return run(scan);
 let raw,a,b;try{raw=texts();validate(raw.a);validate(raw.b);a=normalizeText(raw.a);b=normalizeText(raw.b);formatControls();}catch(e){notify(e.message,true);return;}
 stopTextWorker();result=null;liveTextDiff.clear();navigation();$('diffSummary').textContent='Comparing…';$('changeCount').textContent='…';const id=++revision;worker=new Worker('worker.js');const runningWorker=worker;const fail=message=>{if(id!==revision||worker!==runningWorker)return;stopTextWorker();result=null;viewRows=[];liveTextDiff.clear();$('diffSummary').textContent='Comparison unavailable';$('changeCount').textContent='0';$('canvasLeft').replaceChildren();$('canvasRight').replaceChildren();navigation();notify(message,true);};workerTimer=setTimeout(()=>fail('Comparison timed out after 5 seconds. Simplify ignored text patterns or compare smaller files.'),5000);
 worker.onmessage=({data})=>{if(data.id!==revision||worker!==runningWorker)return;stopTextWorker();if(data.error){viewRows=[];liveTextDiff.clear();navigation();$('changeCount').textContent='0';$('diffSummary').textContent='Comparison unavailable';$('canvasLeft').replaceChildren();$('canvasRight').replaceChildren();notify(data.error,true);return;}
 result=data;$('minorCount').textContent=result.ignoredLineCount?'('+result.ignoredLineCount+')':'';const resolvedProfile=data.resolvedTextProfile||'plain';$('textProfileResolved').hidden=$('textProfile').value!=='auto';$('textProfileResolved').textContent='Automatic → '+(resolvedProfile==='plain'?'Plain text':resolvedProfile.toUpperCase());const ignoredRules=[hasTextGrammar(textGrammar)?'grammar rules':resolvedProfile!=='plain'?resolvedProfile.toUpperCase()+' comments':'',$('ignoreWhitespace').checked?whitespaceScopeLabel($('whitespaceScope').value):'',$('ignoreCase').checked?'case':'',$('ignoreBlankLines').checked?'blank lines':'',ignoredTextPatterns.length?'text patterns':''].filter(Boolean).join(' and ');const ignoredCount=result.ignoredLineCount||0;selectedHunk=Math.min(selectedHunk,Math.max(0,result.hunks.length-1));$('changeCount').textContent=result.hunks.length;$('diffSummary').textContent=result.hunks.length?`${result.hunks.length} changes · +${result.added} / −${result.removed} lines`+(ignoredCount?` · ${ignoredCount} ${ignoredCount===1?'line matches':'lines match'} ignoring ${ignoredRules}`:''):ignoredCount?`No differences (ignoring ${ignoredRules})`:raw.a!==raw.b?'Text matches · line endings differ':'Texts are identical';if(data.grammarFallbacks?.some(Boolean))$('diffSummary').textContent+=' · Grammar fallback: ambiguous syntax kept significant';if(data.syntaxAlignment?.fallbackReason||data.syntaxAlignment?.fallbackRuns)$('diffSummary').textContent+=' · Code alignment: ordinary pairing used'+(data.syntaxAlignment.fallbackReason?' ('+data.syntaxAlignment.fallbackReason+')':' in some sections');if(data.movedBlocks?.reason)$('diffSummary').textContent+=' · Moved text: '+data.movedBlocks.reason;else if(data.movedBlocks?.pairs.length)$('diffSummary').textContent+=' · '+data.movedBlocks.pairs.length+' moved text '+(data.movedBlocks.pairs.length===1?'block':'blocks');if(reveal&&requestedView===viewEpoch)showResults();applyFilter();if(!keep)setDiffScroll(0);navigation();renderRows();};
 worker.onerror=()=>fail('Comparison could not start. Reload and try again.');worker.postMessage({id,a,b,showMovedBlocks:$('showMovedBlocks').checked,syntaxAlignment:$('syntaxAlignment').checked,names:['a','b'].map(side=>files[side].path||files[side].name||''),textProfile:$('textProfile').value,textProfileMappings:structuredClone(textProfileMappings),...(hasTextGrammar(textGrammar)?{textGrammar:structuredClone(textGrammar)}:{}),ignoredTextPatterns,ignore:$('ignoreWhitespace').checked,anchors:textAlignment,ignoreCase:$('ignoreCase').checked,whitespaceScope:$('whitespaceScope').value,...(ignoredTextPatterns.length?{ignoredTextPatterns:structuredClone(ignoredTextPatterns)}:{}),...($('ignoreBlankLines').checked?{ignoreBlankLines:true}:{})});
}
function textColumnWidth(){const style=getComputedStyle($('diffCanvas')),context=document.createElement('canvas').getContext('2d');context.font=style.font;return context.measureText('M').width||8;}
function applyFilter(){document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});if($('folderStatusFilter'))$('folderStatusFilter').value=FOLDER_FILTER_IDS.includes(filter)?filter:'';if(isFolder()){folderTable();return;}refreshLiveText();if(!result)return;viewRows=filterRows(result,filter,$('showMinor').checked);for(const [side,id] of [['a','canvasLeft'],['b','canvasRight']]){let longest=0;for(const entry of viewRows)if(entry.row)longest=Math.max(longest,Math.min(2000,(entry.row[side]||'').replace(/\t/g,'        ').length));$(id).style.height=Math.max(1,viewRows.length)*26+'px';$(id).style.width=Math.max(0,longest*textColumnWidth()+85)+'px';}$('filteredEmpty').hidden=viewRows.length>0;setDiffScroll(0);navigation();renderRows();}
function setFilter(value){if(!['all','diff','same','context',...(isFolder()?FOLDER_FILTER_IDS:[])].includes(value))return;filter=value;markDirty();applyFilter();}
function setDiffScroll(top){$('diffLeft').scrollTop=top;$('diffRight').scrollTop=top;}
function renderRows(){if(!result||$('comparisonView').hidden)return;const box=$('diffLeft'),start=Math.max(0,Math.floor(box.scrollTop/26)-8),end=Math.min(viewRows.length,start+Math.ceil(box.clientHeight/26)+16);
 for(const [side,target] of [['a','canvasLeft'],['b','canvasRight']]){const fragment=document.createDocumentFragment();for(let i=start;i<end;i++){const entry=viewRows[i],el=document.createElement('div');el.style.top=i*26+'px';if(entry.gap){el.className='gap-row';el.textContent=`${entry.count} unchanged lines`;fragment.append(el);continue;}const row=entry.row;el.className='diff-row'+(row.hunk===selectedHunk?' current':'');el.dataset.row=entry.index;const minor=row.minor===true&&$('showMinor').checked;if(minor){el.classList.add('minor-difference');el.title='Minor difference — ignored by the active comparison rules; excluded from merge sections.';}const cell=document.createElement('div');cell.className='diff-cell'+(row[side]===null?' empty':row.type!=='equal'?(side==='a'?' deletion':' insertion'):'');if(minor)cell.classList.add('minor');const num=document.createElement('span');num.className='line-no';if(row[side+'i']!==null){num.tabIndex=0;num.setAttribute('role','button');num.setAttribute('aria-label',`Select ${side==='a'?'left':'right'} line ${row[side+'i']+1} for alignment`);num.title='Select line for manual alignment';const pick=e=>{e.stopPropagation();alignment.pick(side,row[side+'i']);renderRows();};num.onclick=pick;num.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e);}};if(alignment.picked(side,row[side+'i']))num.classList.add('alignment-picked');if(row.anchor)num.classList.add('alignment-anchor');}num.textContent=row[side+'i']===null?'':row[side+'i']+1;const code=document.createElement('code'),value=row[side]??'';if(value.length>2000)code.textContent=value.slice(0,1950)+' … [long line — full text in Edit]';else if((row.type!=='equal'||minor)&&typeof row.a==='string'&&typeof row.b==='string'&&row.a.length<=2000&&row.b.length<=2000){if(!inlineSpans.has(row))inlineSpans.set(row,inlineDiff(row.a,row.b));for(const span of inlineSpans.get(row)[side]){const node=document.createElement(span.changed?'mark':'span');if(span.changed)node.className='inline-change';node.textContent=span.text;code.append(node);}}else code.textContent=value;cell.append(num,code);el.append(cell);if(row.hunk!==undefined)el.onclick=()=>{selectedHunk=row.hunk;navigation();renderRows();};fragment.append(el);}$(target).replaceChildren(fragment);}
}
function navigation(){refreshSessionLock();alignment.refresh();if($('alignFolderPair'))$('alignFolderPair').disabled=operation||!selectedFolderPair();if($('clearFolderAlignment'))$('clearFolderAlignment').disabled=operation||!folderAlignmentPairs.length;$('shellRememberLeft').disabled=operation||isFolder()||isAdvanced()||!files.a.path;$('alignLines').hidden=isFolder()||isAdvanced();$('alignLines').querySelector('span').textContent=textAlignment.length?'Align lines ('+textAlignment.length+')':'Align lines';$('folderViewMode').disabled=operation;$('folderCompareMode').disabled=operation;$('folderTextEncoding').disabled=operation;$('folderTimeTolerance').disabled=operation;for(const side of ['a','b']){const cap=side.toUpperCase();for(const [button,key]of [['Back','canBack'],['Forward','canForward'],['Parent','canParent']])$('folder'+button+cap).disabled=operation||!folderNavigationState[side]?.[key];$('folderHistory'+cap).disabled=operation;if($('folderRemote'+cap)){const remoteButton=$('folderRemote'+cap);remoteButton.disabled=operation;remoteButton.textContent=folders[side]?.remote?'Reconnect':'Remote';remoteButton.title=(folders[side]?.remote?'Reconnect ':'Connect ')+(side==='a'?'left':'right')+' SFTP folder';remoteButton.setAttribute('aria-label',remoteButton.title);}}const folder=isFolder(),differences=folder?folderDifferences():[],count=folder?differences.length:result?.hunks.length||0;$('changePosition').textContent=`${count?(folder?differences.findIndex(row=>row.id===folderDifferenceId)+1:selectedHunk+1):0} / ${count}`;$('previous').disabled=!count||filter==='same';$('next').disabled=!count||filter==='same';const canCopy=folder?desktop&&selection.size>0:!isAdvanced()&&count>0&&filter!=='same'&&!operation;$('mergeToA').disabled=folder?(operation||!canCopyFolderSelection('b')):!canCopy;$('mergeToB').disabled=folder?(operation||!canCopyFolderSelection('a')):!canCopy;$('undoMerge').disabled=folder||!undo.length;$('redoMerge').disabled=folder||!redo.length;$('saveA').disabled=operation;$('saveB').disabled=operation;$('saveServerA').disabled=operation;$('saveServerB').disabled=operation;$('clearA').disabled=operation;$('clearB').disabled=operation;$('openA').disabled=operation&&!desktop;$('openB').disabled=operation&&!desktop;}
function jump(delta){if(isFolder()){const changed=folderDifferences();if(!changed.length)return;const current=changed.findIndex(row=>row.id===folderDifferenceId),next=current<0?(delta<0?changed.length-1:0):(current+delta+changed.length)%changed.length;folderDifferenceId=changed[next].id;refreshFolderRowStatuses();for(const side of ['A','B']){const row=[...$('folderRows'+side).children].find(el=>el.dataset.id===folderDifferenceId);row?.scrollIntoView({block:'nearest'});}return;}if(!result?.hunks.length)return;selectedHunk=(selectedHunk+delta+result.hunks.length)%result.hunks.length;const index=viewRows.findIndex(e=>e.row?.hunk===selectedHunk);if(index<0)return;liveTextDiff.revealHunk(selectedHunk);navigation();refreshLiveText();}
function download(text,name,mime='text/plain'){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let idleWaiters=[],tabSwitchRequest=0;
const pendingTabCloses=new Set();
async function requestTabClose(id){if(!id||pendingTabCloses.has(id))return;pendingTabCloses.add(id);try{while(operation)await new Promise(resolve=>idleWaiters.push(resolve));if(tabs.has(id))return await run(()=>closeTab(id));}finally{pendingTabCloses.delete(id);}}
const pendingOtherTabCloses=new Set();
async function requestCloseOtherTabs(keepId=activeId){
 if(!keepId||pendingOtherTabCloses.has(keepId))return;pendingOtherTabCloses.add(keepId);
 try{while(operation)await new Promise(resolve=>idleWaiters.push(resolve));if(!tabs.has(keepId))return;
  return await run(async()=>{for(const id of [...tabs.keys()].filter(id=>id!==keepId)){if(!tabs.has(id))continue;await closeTab(id);if(tabs.has(id))break;}if(tabs.has(keepId))await switchTab(keepId);});
 }finally{pendingOtherTabCloses.delete(keepId);}
}
function archiveEntryContext(id=activeId){
 const tab=tabs.get(id),entryType=id===activeId?type:tab?.data?.type,link=id===activeId?archiveEntryLink:tab?.archiveEntryLink;
 return tab&&link&&['text-compare','text-merge','binary-compare','table-compare','registry-compare'].includes(entryType)?{id,link,type:entryType}:null;
}
function archiveEntryContextCurrent(context){const current=context&&archiveEntryContext(context.id);return Boolean(current&&current.link===context.link&&current.type===context.type&&tabs.get(context.link.parentId)?.data?.type==='archive-compare');}
function archiveEntryContextCanApply(context,side){
 if(!archiveEntryContextCurrent(context)||!context.link.sides.includes(side))return false;
 if(context.type==='registry-compare'){const saved=context.id===activeId?registryEditor.getState():tabs.get(context.id)?.data?.advanced;return /\.reg$/i.test(context.link.reference.path||'')&&/\.reg$/i.test(saved?.inputs?.[side]?.name||'')&&typeof saved?.options?.resultText==='string'&&(context.id!==activeId||registryArchiveCanApply(side));}
 if(context.type!=='table-compare')return true;
 const saved=context.id===activeId?dataEditor.getState():tabs.get(context.id)?.data?.advanced;
 return Array.isArray(saved?.options?.tableResult)&&/\.(csv|tsv|xlsx|ods)$/i.test(saved?.inputs?.[side]?.name||'');
}
function runArchiveEntryContext(context,side=null){return runWhenIdle(async()=>{
 if(!archiveEntryContextCurrent(context))return;
 if(side===null){await switchTab(context.link.parentId);return;}
 if(!archiveEntryContextCanApply(context,side))return;
 await switchTab(context.id);
 if(activeId!==context.id||!archiveEntryContextCanApply(context,side))return;
 await reviewArchiveEntry(side);
});}
function archiveEntryContextItems(id){
 const context=archiveEntryContext(id);if(!context)return [];
 return [{label:'Archive entry',children:[...['a','b'].map(side=>({label:(['table-compare','registry-compare'].includes(context.type)?'Apply result to ':'Apply ')+(side==='a'?'left':'right')+(['table-compare','registry-compare'].includes(context.type)?' archive…':' to archive…'),disabled:!archiveEntryContextCanApply(context,side),validate:()=>archiveEntryContextCanApply(context,side),action:()=>runArchiveEntryContext(context,side)})),{separator:true},{label:'Return to parent archive',disabled:!archiveEntryContextCurrent(context),validate:()=>archiveEntryContextCurrent(context),action:()=>runArchiveEntryContext(context)}]},{separator:true}];
}
let tabContextMenu;
function showTabContext(id,x,y){
 if(!tabs.has(id))return;tabContextMenu??=createContextMenu('tabContext','Session actions');
 tabContextMenu.open([...archiveEntryContextItems(id),{label:(id===activeId?sessionLocked:tabs.get(id).data?.locked)?'Unlock saved session':'Lock saved session',disabled:!desktop||!(id===activeId?savedPath:tabs.get(id).savedPath),action:()=>runWhenIdle(async()=>{await switchTab(id);await changeSessionLock(!sessionLocked);}),validate:()=>tabs.has(id)},{label:'Compare parent folders',disabled:!desktop,action:()=>runWhenIdle(async()=>{await switchTab(id);await compareParentFolders();}),validate:()=>tabs.has(id)},{label:'Clear session…',action:()=>runWhenIdle(async()=>{await switchTab(id);await clearSession();}),validate:()=>tabs.has(id)},{label:'Close session',action:()=>requestTabClose(id),validate:()=>tabs.has(id)},{label:'Close other sessions',disabled:tabs.size<2,action:()=>requestCloseOtherTabs(id),validate:()=>tabs.has(id)}],x,y,()=>{[...$('sessionTabs').children].find(el=>el.dataset.sessionId===id)?.querySelector('[role=tab]')?.focus();});
}
// Explicit tab navigation follows the latest target even if another switch changes activeId.
async function requestTabSwitch(id){const request=++tabSwitchRequest;while(operation)await new Promise(resolve=>idleWaiters.push(resolve));if(request!==tabSwitchRequest||(id!==null&&!tabs.has(id)))return;return run(()=>id===null?showWelcome():switchTab(id));}
async function runWhenIdle(fn){const id=activeId;while(operation)await new Promise(resolve=>idleWaiters.push(resolve));if(id!==activeId)return;return run(fn);}
async function run(fn){if(operation)return;operation=true;document.body.setAttribute('aria-busy','true');navigation();try{return await fn();}catch(e){if(e.code!=='ABORT_ERR')notify(e.message,true);}finally{operation=false;document.body.setAttribute('aria-busy','false');navigation();const waiting=idleWaiters;idleWaiters=[];for(const resolve of waiting)resolve();if(folderCompareRequested&&!folderCompareBusy&&!expansionTask){clearTimeout(folderCompareTimer);folderCompareTimer=setTimeout(compareVisibleFolders,80);}}}
function scheduleCompare(reveal=false){clearTimeout(autoTimer);const requestedView=viewEpoch;autoTimer=setTimeout(()=>{if(activeId&&!isFolder())compute(true,reveal&&requestedView===viewEpoch);},220);}
function setLoaded(side,data,file=null,reveal=true){validate(data.content);const documentProjection=data.documentProjection===undefined?null:validateDocumentProjection(data.documentProjection);if(documentProjection?.kind==='docx'||documentProjection?.kind==='odt'||documentProjection?.kind==='doc')$(documentProjection.kind+'Scope'+side.toUpperCase()).value=documentProjection.scope;if(documentProjection?.kind==='pdf')$('pdfOrder'+side.toUpperCase()).value=documentProjection.order||'document';let remote=remoteTextSources.get(activeId);if(!remote){remote={};remoteTextSources.set(activeId,remote);}if(!documentProjection&&data.source?.canSaveToServer&&data.source.saveToken)remote[side]={...data.source};else delete remote[side];invalidateArchiveEntrySide(side);localEdits[side]=false;setArea(side,data.content,data.format||{...defaultFormat(),lineEnding:detectLineEnding(data.content)});files[side]={name:data.name||'',path:data.path||'',...(documentProjection?{documentProjection}:{}),...(data.source?.displayPath?{displayPath:data.source.displayPath}:{})};sources[side]=file;refreshArchiveEntryActions();undo=[];redo=[];invalidate();markDirty();scheduleCompare(reveal);}
async function pasteClipboard(side='a',newComparison=false){if(!desktop?.readClipboardText)throw Error('Clipboard comparison is available in the desktop app.');const text=await desktop.readClipboardText();validate(text);if(text===''){notify('The clipboard has no text to compare.');return;}if(newComparison||!activeId||isFolder()||isAdvanced())await newSession('text-compare');invalidateArchiveEntrySide(side);pushHistory(undo,historyText());redo=[];setArea(side,text);if(!files[side].name&&!files[side].path)files[side]={name:'Clipboard',path:''};localEdits[side]=true;changeWarned=false;invalidate();markDirty();compute(false,true);snapshot();}
async function openSide(side){if(type==='folder-merge3')return threeWayEditor.selectSide(side==='a'?'left':'right');stopExpansion();if(!activeId)await newSession();if(isAdvanced())return currentEditor().openSide(side);if(isFolder()){const selected=await desktop.chooseFolder(side);if(!selected)return;await applyFolderRoot(side,selected);return;}if(desktop){const requestedView=viewEpoch,data=await desktop.openText(side,$('readEncoding'+side.toUpperCase()).value,pdfReadOptions(side));if(data)setLoaded(side,data,null,requestedView===viewEpoch);}else $('file'+side.toUpperCase()).click();}
let folderNavigationState={a:{},b:{}},folderNavigationRequest=0,folderRootEpoch=0;
async function refreshFolderNavigation(){const request=++folderNavigationRequest,id=activeId;if(!desktop||!isFolder())return;try{const state=await desktop.folderNavigation();if(request!==folderNavigationRequest||id!==activeId||!isFolder())return;folderNavigationState=state;for(const side of ['a','b']){const cap=side.toUpperCase(),item=state[side];for(const [button,key]of [['Back','canBack'],['Forward','canForward'],['Parent','canParent']])$('folder'+button+cap).disabled=operation||!item[key];const select=$('folderHistory'+cap);select.replaceChildren(new Option('Recent folders…',''));for(const path of item.history)select.add(new Option(path,path));select.value='';}}catch(error){notify(error.message,true);}}
async function applyFolderRoot(side,selected,{load=true}={}){clearTimeout(noticeTimer);$('notice').hidden=true;folderRootEpoch++;folderTreeRevision=null;if(!folders[side]?.disconnected||!selected?.remote||!['host','port','username','path'].every(key=>folders[side][key]===selected[key]))folderAlignmentPairs=[];folderIgnoredMarks=[];folders[side]=selected;folderRows=[];selection.clear();folderRelative='';expandedFolders=new Set();sideSelection={a:new Set(),b:new Set()};folderFocus={side,path:null};selectionAnchor={a:null,b:null};plan=null;metadata();await refreshFolderNavigation();if(load)await scan();markDirty();}
async function navigateFolderParents(){if(!desktop||!isFolder())return;stopExpansion();try{const selected=await desktop.navigateFolderParents();folders=selected;const side=selected[folderFocus.side]?folderFocus.side:selected.a?'a':'b';await applyFolderRoot(side,selected[side]);}finally{metadata();}}
async function navigateFolder(side,action,value){if(!desktop||!isFolder())return;stopExpansion();try{const selected=await desktop.navigateFolder(side,action,value);if(selected)await applyFolderRoot(side,selected);}finally{metadata();}}
async function loadFile(side,file){if(!file)return;if(file.size>(isDocumentInput(file.name)?32*1024*1024:maxBytes))throw Error(isDocumentInput(file.name)?'Document exceeds the 32 MB input limit.':`File exceeds the ${desktop?'10':'2'} MB limit.`);const requestedView=viewEpoch,encoding=$('readEncoding'+side.toUpperCase()).value,path=desktop?.droppedFilePath(file);if(path){const data=await desktop.openTextPath(side,path,encoding,pdfReadOptions(side));setLoaded(side,data,null,requestedView===viewEpoch);return;}const data=await decodeTextInput(new Uint8Array(await file.arrayBuffer()),file.name,encoding,pdfReadOptions(side));setLoaded(side,{...data,name:file.name,path:''},file,requestedView===viewEpoch);}
async function saveRemoteText(side){
 if(!desktop||isFolder()||isAdvanced())throw Error('Open a remote text file first.');
 if(files[side]?.documentProjection)throw Error('Export projected document text as a separate local text file.');const id=activeId,source=remoteTextSources.get(id)?.[side];if(!source)throw Error('This input cannot be saved to a server. Reopen it from a connected folder, or save a local copy.');
 const content=texts()[side],format={...textFormats[side]},saveRevision=revision;
 const saved=await desktop.saveRemoteText(id,side,source.saveToken,content,format);
 if(!saved||saved.cancelled)return;
 if(activeId!==id||remoteTextSources.get(id)?.[side]!==source)return;
 if(revision===saveRevision){textFormats[side]=saved.format;localEdits[side]=false;}
 metadata();markDirty();notify(revision===saveRevision?'File saved to server.':'File saved to server. Your newer edits are still unsaved.');
}
if(desktop?.onRemoteTextSourceInvalidated)desktop.onRemoteTextSourceInvalidated(({sessionId,side,saveToken})=>{
 const sources=remoteTextSources.get(sessionId);if(!sources?.[side]||sources[side].saveToken!==saveToken)return;
 delete sources[side];if(sessionId===activeId){metadata();navigation();}
});
function clearRemoteTextSource(side){const source=remoteTextSources.get(activeId)?.[side];if(source){delete remoteTextSources.get(activeId)[side];void desktop?.clearRemoteTextSource(activeId,side,source.saveToken).catch(error=>notify(error.message,true));}}
async function saveText(side){if(type==='folder-merge3'){notify('Use Review output changes and Apply reviewed changes to write merged output. Save Session keeps your input folders and choices.');return;}if(isAdvanced())return currentEditor().saveResult();if(isFolder())return;const content=texts()[side],name=files[side].documentProjection||isDocumentInput(files[side].name)?(files[side].name.replace(/\.(doc|docx|pdf|rtf|odt)$/i,'')||'document')+'.txt':files[side].name||(side==='a'?'left.txt':'right.txt');if(!desktop){validate(content);const encoded=encodeText(content,textFormats[side]);if(encoded.byteLength>maxBytes)throw Error('Encoded file exceeds the 2 MB browser limit.');download(encoded,name,'application/octet-stream');notify('Download started.');return;}const saveRevision=revision;const saved=await desktop.saveText(content,name,side,textFormats[side]);if(saved&&!saved.cancelled){clearRemoteTextSource(side);if(files[side].documentProjection)invalidateArchiveEntrySide(side);files[side]={name:saved.name,path:saved.path};refreshArchiveEntryActions();if(saveRevision===revision){if(saved.format)textFormats[side]=saved.format;localEdits[side]=false;}changeWarned=false;metadata();markDirty();if($('textProfile').value==='auto'){invalidate();compute(true,false);}notify('File saved.');}}
async function swap(){if(type==='folder-merge3'){notify('Choose the left and right folders in the review to change their order, then analyze again.');return;}stopExpansion();archiveEntryLink=null;refreshArchiveEntryActions();if(isAdvanced()){const saved=currentEditor().getState();[saved.inputs.a,saved.inputs.b]=[saved.inputs.b,saved.inputs.a];if(type==='audio-compare')saved.options.offset=-(saved.options.offset||0);if(type==='table-compare'){const a=saved.options.sheeta||0,b=saved.options.sheetb||0;saved.options.sheeta=b;saved.options.sheetb=a;if(saved.options.tableTemplate)saved.options.tableTemplate.side=saved.options.tableTemplate.side==='a'?'b':'a';}if(type==='text-merge3')for(const key of ['mergeReadEncodings','mergeDrafts','mergePdfOrders','mergeDocxScopes','mergeOdtScopes','mergeDocScopes','mergeDocumentProjections']){const map=saved.options[key];if(map){const a=map.a,b=map.b;delete map.a;delete map.b;if(b!==undefined)map.a=b;if(a!==undefined)map.b=a;}}if(type==='text-merge3'&&saved.options.choices)for(const key of Object.keys(saved.options.choices)){const choice=saved.options.choices[key];saved.options.choices[key]=({left:'right',right:'left',both:'both-reverse','both-reverse':'both'})[choice]||choice;}if(dedicatedEditors[type])await dedicatedEditors[type].setState(saved);else await dataEditor.setType(type,saved);markDirty();snapshot();return;}if(desktop)await desktop.swapSides();const remote=remoteTextSources.get(activeId);if(remote)[remote.a,remote.b]=[remote.b,remote.a];const {a,b}=texts(),formats={a:{...textFormats.a},b:{...textFormats.b}},swappedAlignment=textAlignment.map(p=>({a:p.b,b:p.a}));setArea('a',b,formats.b);setArea('b',a,formats.a);textAlignment=swappedAlignment;[files.a,files.b]=[files.b,files.a];[localEdits.a,localEdits.b]=[localEdits.b,localEdits.a];[sources.a,sources.b]=[sources.b,sources.a];[$('readEncodingA').value,$('readEncodingB').value]=[$('readEncodingB').value,$('readEncodingA').value];[$('pdfOrderA').value,$('pdfOrderB').value]=[$('pdfOrderB').value,$('pdfOrderA').value];[$('docxScopeA').value,$('docxScopeB').value]=[$('docxScopeB').value,$('docxScopeA').value];[$('odtScopeA').value,$('odtScopeB').value]=[$('odtScopeB').value,$('odtScopeA').value];[$('docScopeA').value,$('docScopeB').value]=[$('docScopeB').value,$('docScopeA').value];[folders.a,folders.b]=[folders.b,folders.a];undo=[];redo=[];invalidate();markDirty();if(isFolder()){const encodingA=folderRules.textEncodingA,encodingB=folderRules.textEncodingB;delete folderRules.textEncodingA;delete folderRules.textEncodingB;if(encodingB!==undefined)folderRules.textEncodingA=encodingB;if(encodingA!==undefined)folderRules.textEncodingB=encodingA;folderRuleControls();folderIgnoredMarks=[];folderRootEpoch++;folderTreeRevision=null;expandedFolders=new Set();sideSelection={a:new Set(),b:new Set()};folderRows=[];selection.clear();folderTable();if(folders.a&&folders.b)await scan();}else compute();}
async function reload(){if(type==='folder-merge3')return threeWayEditor.analyze();if(isFolder()){await scan();return;}if(!await guard('Save session changes before reloading?'))return;const loaded={};for(const side of ['a','b']){if(desktop&&files[side].path)loaded[side]=await desktop.reloadText(side,undefined,pdfReadOptions(side));else if(sources[side])loaded[side]={...files[side],...await decodeTextInput(new Uint8Array(await sources[side].arrayBuffer()),sources[side].name,textFormats[side].encoding,pdfReadOptions(side))};}
 if(!Object.keys(loaded).length){notify('Open a file before reloading.');return;}for(const data of Object.values(loaded))validate(data.content);for(const [side,data]of Object.entries(loaded))if(data){invalidateArchiveEntrySide(side);setArea(side,data.content,data.format);files[side]={name:data.name,path:data.path||'',...(data.documentProjection?{documentProjection:validateDocumentProjection(data.documentProjection)}:{})};localEdits[side]=false;}changeWarned=false;undo=[];redo=[];invalidate();markDirty();compute();}
function merge(from,hunkIndex=selectedHunk,lines=liveTextDiff.getSelection(from)){
 if(!activeId||isAdvanced())return;if(isFolder())return runFolderWhenIdle(()=>folderAction('copy',from));
 if(!result?.hunks.length||filter==='same'||!result.hunks[hunkIndex])return;
 const before=texts(),a=normalizeText(before.a),b=normalizeText(before.b),target=from==='a'?'b':'a';
 const next=lines?.length?engine.mergeLines(a,b,result.rows,from,lines):engine.merge(a,b,result.hunks[hunkIndex],from);
 const output=projectText(before[target],next);if(output===before[target])return;validate(output);
 pushHistory(undo,before);redo=[];localEdits[target]=true;setArea(target,output);selectedHunk=hunkIndex;metadata();markDirty();compute(true,false);snapshot();
}
function pushHistory(stack,value){stack.push({...value,textAlignment:textAlignment.map(p=>({...p})),formats:{a:{...textFormats.a},b:{...textFormats.b}}});const entrySize=x=>x.a.length+x.b.length+(x.pendingViews?.a.length||0)+(x.pendingViews?.b.length||0);let size=stack.reduce((n,x)=>n+entrySize(x),0);while(stack.length>1&&(stack.length>30||size>20*1024*1024)){const removed=stack.shift();size-=entrySize(removed);}}
function applyHistory(from,to){const previous=from.pop();if(!previous)return;pushHistory(to,historyText());localEdits={a:true,b:true};setArea('a',previous.a,previous.formats?.a);setArea('b',previous.b,previous.formats?.b);textAlignment=previous.textAlignment||[];if(previous.pendingViews){$('textA').value=previous.pendingViews.a;$('textB').value=previous.pendingViews.b;}metadata();markDirty();compute(true,!$('comparisonView').hidden);}
function undoMerge(){applyHistory(undo,redo);}
function redoMerge(){applyHistory(redo,undo);}
function setType(value,changed=true,advancedState=null,archiveRuntime=null,binaryRuntime=null,tableRuntime=null,mergeRuntime=null){let ready=Promise.resolve();if(!types.includes(value)||(!desktop&&value!=='text-compare'))throw Error('This session type is available in the desktop app.');type=value;const advanced=isAdvanced();document.querySelector('.toolbar').hidden=advanced;document.querySelector('.path-row').hidden=advanced;document.querySelector('.statusbar').hidden=advanced;$('advancedWorkspace').hidden=!advanced;$('dataWorkspace').hidden=!advanced||!!dedicatedEditors[type];for(const [kind,host]of [['picture-compare','pictureWorkspace'],['audio-compare','mediaWorkspace'],['archive-compare','archiveWorkspace'],['registry-compare','registryWorkspace'],['folder-merge3','folderThreeWayWorkspace']]){$(host).hidden=type!==kind;if(type!==kind)dedicatedEditors[kind].reset();}if(!advanced||dedicatedEditors[type])dataEditor.reset();if(advanced){if(dedicatedEditors[type])ready=Promise.resolve(dedicatedEditors[type].setState(advancedState,type==='archive-compare'?archiveRuntime:null));else ready=Promise.resolve(dataEditor.setType(type,advancedState,type==='binary-compare'?binaryRuntime:type==='table-compare'?tableRuntime:type==='text-merge3'?mergeRuntime:null));}$('sessionKind').textContent=value==='folder-merge3'?'Three-way Folder Merge':value.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');const folder=isFolder();document.body.classList.toggle('folder-mode',folder);document.querySelectorAll('[data-folder-filter]').forEach(el=>el.hidden=!folder);document.querySelectorAll('[data-filter="context"]').forEach(el=>el.hidden=false);$('textWorkspace').hidden=folder||advanced;textTools.setEnabled(!folder&&!advanced&&!$('inputView').hidden);$('folderWorkspace').hidden=!folder;$('diffSummary').hidden=folder;$('folderSummary').hidden=!folder;for(const id of ['ignoreWhitespace','ignoreCase','ignoreBlankLines','showMovedBlocks','syntaxAlignment','whitespaceScope','textProfile'])$(id).disabled=folder;document.querySelectorAll('.text-comparison-rule').forEach(el=>el.hidden=folder);$('previewPlan').hidden=value==='folder-compare';refreshSyncControls();$('undoMerge').hidden=folder;$('redoMerge').hidden=folder;$('mergeToA').hidden=false;$('mergeToB').hidden=false;metadata();applyFilter();navigation();if(changed)markDirty();return ready;}
function threeWaySessionData(){const state=threeWayEditor.getState();return {roots:{base:state.roots?.base||null,left:state.roots?.left||null,right:state.roots?.right||null},choices:state.choices||{},output:state.output||null};}
function refreshSyncControls(){$('syncModeLabel').hidden=type!=='folder-sync';$('directionLabel').hidden=type==='folder-compare'||(type==='folder-sync'&&$('folderSyncMode').value==='update-both');}
function disconnectedFolders(){return ['a','b'].some(side=>folders[side]?.disconnected===true);}
function savedRemoteFolders(){if(!isFolder())return {};const remote={a:null,b:null};for(const side of ['a','b']){const endpoint=folders[side];if(endpoint?.remote)remote[side]={protocol:'sftp',host:endpoint.host,port:endpoint.port,username:endpoint.username||'',root:endpoint.path};}return remote.a||remote.b?{remoteFolders:remote}:{};}
function restoredFolders(data){const restored={a:data.folders?.a||null,b:data.folders?.b||null};for(const side of ['a','b']){const endpoint=data.remoteFolders?.[side];if(endpoint&&!restored[side])restored[side]={remote:true,disconnected:true,host:endpoint.host,port:endpoint.port,username:endpoint.username,path:endpoint.root,name:endpoint.root};}return restored;}
function sessionData(){return {version:1,type,...(sessionLocked?{locked:true}:{}),...(type==='folder-merge3'?{threeWay:threeWaySessionData()}:isAdvanced()?{advanced:currentEditor().getState()}:{}),name:$('sessionName').value||'Untitled',text:texts(),files,folders:{a:folders.a?.remote?null:folders.a,b:folders.b?.remote?null:folders.b},...savedRemoteFolders(),options:{showMovedBlocks:$('showMovedBlocks').checked,syntaxAlignment:$('syntaxAlignment').checked,textProfile:$('textProfile').value,textProfileMappings:structuredClone(textProfileMappings),...(hasTextGrammar(textGrammar)?{textGrammar:structuredClone(textGrammar)}:{}),readEncodings:{a:$('readEncodingA').value,b:$('readEncodingB').value},docxScopes:Object.fromEntries(['a','b'].map(side=>[side,files[side].documentProjection?.kind==='docx'?files[side].documentProjection.scope:$('docxScope'+side.toUpperCase()).value])),odtScopes:Object.fromEntries(['a','b'].map(side=>[side,files[side].documentProjection?.kind==='odt'?files[side].documentProjection.scope:$('odtScope'+side.toUpperCase()).value])),docScopes:Object.fromEntries(['a','b'].map(side=>[side,files[side].documentProjection?.kind==='doc'?files[side].documentProjection.scope:$('docScope'+side.toUpperCase()).value])),pdfOrders:Object.fromEntries(['a','b'].map(side=>[side,files[side].documentProjection?.kind==='pdf'?(files[side].documentProjection.order||'document'):$('pdfOrder'+side.toUpperCase()).value])),...(isFolder()?{folderNameRules:{...folderNameRules},folderAlignment:folderAlignmentPairs.map(pair=>({...pair}))}:{}),textAlignment:textAlignment.map(p=>({...p})),textFormats:{a:{...textFormats.a},b:{...textFormats.b}},ignoreWhitespace:$('ignoreWhitespace').checked,ignoreCase:$('ignoreCase').checked,whitespaceScope:$('whitespaceScope').value,...(ignoredTextPatterns.length?{ignoredTextPatterns:structuredClone(ignoredTextPatterns)}:{}),...($('ignoreBlankLines').checked?{ignoreBlankLines:true}:{}),showMinor:$('showMinor').checked,filter,direction:$('folderDirection').value,...(type==='folder-sync'?{folderSyncMode:$('folderSyncMode').value}:{}),folderInclude:$('folderInclude').value,folderExclude:$('folderExclude').value,folderSearch:$('folderSearch').value,textTools:textTools.getState(),folderView:{...folderViewState},folderRules:{...folderRules}}};}
function refreshSessionLock(){const button=$('sessionLock');button.hidden=!desktop||!activeId||!savedPath;button.textContent=sessionLocked?'🔒':'🔓';button.title=sessionLocked?'Saved session is locked. Click to unlock. Save creates a separate copy.':'Lock saved session against overwrites';button.setAttribute('aria-label',sessionLocked?'Unlock saved session':'Lock saved session');}
async function changeSessionLock(locked){if(!desktop||!savedPath)throw Error('Save this session before locking it.');const out=await desktop.setSessionLocked(locked);sessionLocked=out.locked;savedPath=out.path;refreshSessionLock();snapshot();notify(sessionLocked?'Saved session locked. Save creates a separate copy; compared files remain editable.':'Saved session unlocked.');}
async function saveSession(as=false){if(!activeId)return false;const data=sessionData();if(desktop){const out=await desktop.saveSession(data,as||sessionLocked);if(out.cancelled)return false;savedPath=out.path;sessionLocked=false;}else{download(JSON.stringify(data,null,2),(data.name.replace(/[^a-z0-9 _-]/gi,'_')||'Untitled')+'.fcompare','application/json');savedPath=data.name+'.fcompare';}$('sessionLocation').textContent=savedPath.split(/[\\/]/).pop();$('sessionLocation').title=savedPath;markDirty(false);refreshSessionLock();notify('Session saved.');return true;}
function guard(message='Save the current session before continuing.'){if(!dirty)return Promise.resolve(true);if(pendingGuard)return Promise.resolve(false);$('unsavedMessage').textContent=message;$('unsavedDialog').showModal();return new Promise(resolve=>pendingGuard=resolve);}
function finishGuard(value){$('unsavedDialog').close();const resolve=pendingGuard;pendingGuard=null;resolve?.(value);}
function snapshot(){if(!activeId)return;tabs.set(activeId,{name:$('sessionName').value,dirty,data:sessionData(),runtimeFolders:{...folders},threeWayRuntime:type==='folder-merge3'?threeWayEditor.getState():null,archiveRuntime:type==='archive-compare'?archiveEditor.getRuntimeState():null,binaryRuntime:type==='binary-compare'?dataEditor.getRuntimeState():null,tableRuntime:type==='table-compare'?dataEditor.getRuntimeState():null,mergeRuntime:type==='text-merge3'?dataEditor.getRuntimeState():null,savedPath,sources,archiveEntryLink,folderRelative,folderRows,folderIgnoredMarks:folderIgnoredMarks.map(mark=>({...mark})),folderTreeRevision,folderAlignmentPairs:folderAlignmentPairs.map(pair=>({...pair})),folderViewState:{...folderViewState},folderScanInfo:{...folderScanInfo},parentTabId,folderFocus:{...folderFocus},selectionAnchor:{...selectionAnchor},expandedFolders:new Set(expandedFolders),sideSelection:{a:new Set(sideSelection.a),b:new Set(sideSelection.b)},localEdits,undo,redo});}
function renderTabs(){const fragment=document.createDocumentFragment();for(const [id,tab] of tabs){const el=document.createElement('div');el.dataset.sessionId=id;el.oncontextmenu=event=>{event.preventDefault();showTabContext(id,event.clientX,event.clientY);};el.className='session-tab'+(id===activeId?' active':'');const button=document.createElement('button');button.role='tab';button.setAttribute('aria-selected',String(id===activeId));button.textContent=(tab.name||'Untitled')+(tab.dirty?' •':'');button.onclick=()=>requestTabSwitch(id);button.onkeydown=event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();const rect=button.getBoundingClientRect();showTabContext(id,rect.left,rect.bottom);}};const close=document.createElement('button');close.className='close-tab';close.textContent='×';close.setAttribute('aria-label','Close '+(tab.name||'Untitled'));close.onclick=()=>requestTabClose(id);el.append(button,close);fragment.append(el);}$('sessionTabs').replaceChildren(fragment);folderViewControls();refreshArchiveEntryActions();}
function showWorkspace(){ $('welcome').hidden=true;$('activeWorkspace').hidden=false; }
function showWelcome(){stopExpansion();if(!desktop)return newSession();snapshot();clearTimeout(autoTimer);invalidate();activeId=null;dirty=false;$('dirtyIndicator').hidden=true;document.title='Further Compare';$('welcome').hidden=false;$('activeWorkspace').hidden=true;renderTabs();}
async function restoreTabRuntime(id){activeId=id;const tab=tabs.get(id),wasDirty=tab.dirty;await restore({...tab.data,folders:tab.runtimeFolders||tab.data.folders},tab.savedPath,tab.threeWayRuntime,tab.archiveRuntime,tab.binaryRuntime,tab.tableRuntime,tab.mergeRuntime);archiveEntryLink=tab.archiveEntryLink||null;refreshArchiveEntryActions();sources=tab.sources;folderRelative=tab.folderRelative;folderRows=tab.folderRows;folderIgnoredMarks=tab.folderIgnoredMarks||[];folderTreeRevision=tab.folderTreeRevision||null;folderAlignmentPairs=tab.folderAlignmentPairs||[];folderScanInfo={state:'loaded',skipped:0,...tab.folderScanInfo};folderViewState={mode:'tree',sort:'name',descending:false,...tab.folderViewState};parentTabId=tab.parentTabId||null;folderFocus=tab.folderFocus||{side:'a',path:null};selectionAnchor=tab.selectionAnchor||{a:null,b:null};expandedFolders=new Set(tab.expandedFolders||[]);sideSelection=tab.sideSelection||{a:new Set(),b:new Set()};selection=new Set([...sideSelection.a,...sideSelection.b]);localEdits=tab.localEdits;undo=tab.undo;redo=tab.redo||[];markDirty(wasDirty);showWorkspace();renderTabs();}
async function restorePreviousWorkspace(id,tab){
 if(id&&tab){tabs.set(id,tab);if(desktop)await desktop.activateSession(id);await restoreTabRuntime(id);}
 else{activeId=null;dirty=false;$('dirtyIndicator').hidden=true;$('welcome').hidden=false;$('activeWorkspace').hidden=true;renderTabs();}
}
function quarantineWorkspace(){activeId=null;dirty=false;clearTimeout(autoTimer);invalidate();$('dirtyIndicator').hidden=true;$('welcome').hidden=false;$('activeWorkspace').hidden=true;renderTabs();}
async function rollbackWorkspace(id,tab,error,discardIds=[]){const failures=[];try{await restorePreviousWorkspace(id,tab);}catch(rollbackError){quarantineWorkspace();failures.push('The previous workspace could not be restored; its tab snapshot is retained. Reopen the tab before continuing. '+rollbackError.message);}for(const discard of (Array.isArray(discardIds)?discardIds:[discardIds]))if(discard&&discard!==id){tabs.delete(discard);remoteTextSources.delete(discard);filenameSearchStates.delete(discard);folderSuppressedTabs.delete(discard);folderAllContentsTabs.delete(discard);if(desktop)try{await desktop.closeSession(discard);}catch(cleanupError){failures.push('A temporary native session could not be closed: '+cleanupError.message);}}renderTabs();if(error||failures.length)throw Error([error?.message,...failures].filter(Boolean).join(' '));}
async function switchTabUnlocked(id){if(id!==activeId)stopExpansion();if(id===activeId){showWorkspace();return;}snapshot();const previous=activeId,prior=tabs.get(previous);clearTimeout(autoTimer);invalidate();try{if(desktop)await desktop.activateSession(id);await restoreTabRuntime(id);}catch(error){await rollbackWorkspace(previous,prior,error);}}
async function switchTab(id){await lockedWorkspaceInput(()=>switchTabUnlocked(id));if(isFolder())await scan();}
async function closeTab(id=activeId){stopExpansion();if(!id)return;if(id!==activeId)await switchTab(id);if(!await guard())return;await lockedWorkspaceInput(async()=>{if(desktop)await desktop.closeSession(id);tabs.delete(id);remoteTextSources.delete(id);filenameSearchStates.delete(id);folderSuppressedTabs.delete(id);folderAllContentsTabs.delete(id);activeId=null;clearTimeout(autoTimer);invalidate();const next=[...tabs.keys()].pop();if(next)await switchTabUnlocked(next);else if(desktop)showWelcome();else await newSessionUnlocked();});if(isFolder())await scan();}
async function compareParentFolders(){await lockedWorkspaceInput(async()=>{if(!desktop)throw Error('Open disk files in the desktop app to compare their parent folders.');if(type==='folder-merge3')throw Error('Open a two-sided comparison to compare parent folders.');const request={source:isFolder()?'folder':isAdvanced()?'advanced':'text'};if(request.source==='advanced'){const inputs=currentEditor().getState().inputs;request.tokens={a:inputs.a?.diskToken,b:inputs.b?.diskToken};}const out=await desktop.compareParentFolders(request);await newSessionUnlocked('folder-compare',out.id);folders=out.folders;await applyFolderRoot('a',out.folders.a,{load:false});snapshot();});await scan();}
async function clearSession(){if(!activeId||!await guard('Save session changes before clearing this comparison?'))return;return lockedWorkspaceInput(async()=>{const id=activeId,currentType=type;stopExpansion();let reset=false;try{if(desktop)await desktop.resetSession();reset=true;remoteTextSources.delete(id);filenameSearchStates.delete(id);folderSuppressedTabs.delete(id);folderAllContentsTabs.delete(id);await newSessionUnlocked(currentType,id);notify('Session cleared.');}catch(error){if(reset){tabs.delete(id);quarantineWorkspace();if(desktop)await desktop.closeSession(id).catch(()=>{});throw Error('The comparison was cleared, but its empty workspace could not be initialized. Reopen its sources in a new comparison. '+error.message);}throw error;}});}
async function newSessionUnlocked(value='text-compare',nativeId=null,{restoring=false}={}){let defaults=null;if(!restoring&&desktop?.getSessionDefaults){try{defaults=await desktop.getSessionDefaults(value);}catch(error){notify('Could not load session defaults: '+error.message,true);}}stopExpansion();snapshot();const previous=activeId,prior=tabs.get(previous);const nextId=nativeId||(desktop?(await desktop.createSession()).id:crypto.randomUUID());try{ignoredTextDialog.close();textProfileMappingsDialog.close();textGrammarDialog.close();textGrammar=validateTextGrammar();textProfileMappings=[];ignoredTextPatterns=[];folderNameRules={};folderTreeRevision=null;folderAlignmentPairs=[];folderIgnoredMarks=[];textAlignment=[];alignment.reset();folderScanInfo={state:'loaded',skipped:0};folderRules={mode:'content',timeToleranceMs:0};folderViewState={mode:'tree',sort:'name',descending:false};parentTabId=null;archiveEntryLink=null;refreshArchiveEntryActions();clearTimeout(autoTimer);invalidate();activeId=nextId;tabs.set(activeId,{name:'Untitled',dirty:false});files={a:{name:'',path:''},b:{name:'',path:''}};folders={a:null,b:null};sources={a:null,b:null};localEdits={a:false,b:false};changeWarned=false;folderRelative='';expandedFolders=new Set();sideSelection={a:new Set(),b:new Set()};setArea('a','',defaultFormat());setArea('b','',defaultFormat());$('readEncodingA').value='auto';$('readEncodingB').value='auto';$('pdfOrderA').value='document';$('pdfOrderB').value='document';$('docxScopeA').value='main-document';$('docxScopeB').value='main-document';$('odtScopeA').value='main-document';$('odtScopeB').value='main-document';$('docScopeA').value='main-document';$('docScopeB').value='main-document';restoreTextTools(null);$('folderInclude').value='*';$('folderExclude').value='';$('folderSearch').value='';$('sessionName').value=value==='folder-merge3'?'Three-way Folder Merge':value.split('-').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');$('ignoreWhitespace').checked=false;$('ignoreCase').checked=false;$('ignoreBlankLines').checked=false;$('showMovedBlocks').checked=false;$('syntaxAlignment').checked=false;$('textProfile').value='plain';$('whitespaceScope').value='all';$('showMinor').checked=false;$('minorCount').textContent='';$('folderDirection').value='a-to-b';$('folderSyncMode').value='mirror';filter='all';savedPath='';sessionLocked=false;$('sessionLocation').textContent='Untitled';folderRows=[];selection.clear();undo=[];redo=[];if(defaults){const options=defaults.options;for(const key of ['ignoreWhitespace','ignoreCase','ignoreBlankLines','showMovedBlocks','syntaxAlignment','showMinor'])if(options[key]!==undefined)$(key).checked=options[key];for(const key of ['textProfile','whitespaceScope','folderInclude','folderExclude','folderSyncMode'])if(options[key]!==undefined)$(key).value=options[key];textGrammar=validateTextGrammar(options.textGrammar);textProfileMappings=validateTextProfileMappings(options.textProfileMappings);if(options.ignoredTextPatterns)ignoredTextPatterns=validateIgnoredTextPatterns(options.ignoredTextPatterns);if(options.direction)$('folderDirection').value=options.direction;if(options.filter)filter=options.filter;if(options.folderRules)folderRules={...options.folderRules};if(options.folderNameRules)folderNameRules=validateFolderNameRules(options.folderNameRules);if(options.folderView)folderViewState={...options.folderView};if(options.textTools)restoreTextTools(options.textTools);}if(!restoring&&desktop&&value.startsWith('folder-')&&value!=='folder-merge3')await desktop.setFolderNameRules(folderNameRules);await setType(value,false,defaults?.advancedOptions?{inputs:{a:null,b:null,base:null},options:defaults.advancedOptions}:null);showInputs();folderTable();markDirty(false);showWorkspace();snapshot();renderTabs();}catch(error){await rollbackWorkspace(previous,prior,error,nextId);}}
async function newSession(...args){return lockedWorkspaceInput(()=>newSessionUnlocked(...args));}
async function restore(data,path,threeWayRuntime=null,archiveRuntime=null,binaryRuntime=null,tableRuntime=null,mergeRuntime=null){archiveEntryLink=null;refreshArchiveEntryActions();if(data?.options?.folderView?.hideLegend!==undefined&&typeof data.options.folderView.hideLegend!=='boolean')throw Error('Invalid legend visibility.');if(data?.options?.folderView?.alwaysShowFolders!==undefined&&typeof data.options.folderView.alwaysShowFolders!=='boolean')throw Error('Invalid folder visibility.');if(data?.options?.whitespaceScope!==undefined&&!WHITESPACE_SCOPES.includes(data.options.whitespaceScope))throw Error('Invalid whitespace comparison scope.');if(data?.options?.ignoreBlankLines!==undefined&&typeof data.options.ignoreBlankLines!=='boolean')throw Error('Invalid blank line comparison rule.');if(data?.options?.showMovedBlocks!==undefined&&typeof data.options.showMovedBlocks!=='boolean')throw Error('Invalid moved block display option.');if(data?.options?.syntaxAlignment!==undefined&&typeof data.options.syntaxAlignment!=='boolean')throw Error('Invalid code structure alignment option.');if(data?.options?.showMinor!==undefined&&typeof data.options.showMinor!=='boolean')throw Error('Invalid minor difference display option.');if(data?.options?.ignoreCase!==undefined&&typeof data.options.ignoreCase!=='boolean')throw Error('Invalid case comparison rule.');if(!data||data.version!==1||!types.includes(data.type)||!data.text||!data.files||!data.options||typeof data.name!=='string'||!['all','diff','same','context',...(['folder-compare','folder-merge','folder-sync'].includes(data.type)?FOLDER_FILTER_IDS:[])].includes(data.options.filter))throw Error('Invalid comparison session.');if(!desktop&&data.type!=='text-compare')throw Error('Open this session in the desktop app.');validate(data.text.a);validate(data.text.b);for(const side of ['a','b'])if(!data.files[side]||typeof data.files[side].name!=='string'||typeof data.files[side].path!=='string')throw Error('Invalid file information in session.');
 for(const side of ['a','b'])if(data.files[side].documentProjection!==undefined)data.files[side].documentProjection=validateDocumentProjection(data.files[side].documentProjection);
 const requestedDocx=data.options.docxScopes;if(requestedDocx!==undefined&&(!requestedDocx||typeof requestedDocx!=='object'||Array.isArray(requestedDocx)||Object.keys(requestedDocx).some(key=>!['a','b'].includes(key))||!['a','b'].every(side=>['main-document','main-and-related-text'].includes(requestedDocx[side]))))throw Error('Invalid DOCX text scopes.');for(const side of ['a','b']){const scope=requestedDocx?.[side]||'main-document',projection=data.files[side].documentProjection;if(projection?.kind==='docx'&&projection.scope!==scope)throw Error('DOCX text scope disagrees with saved extraction provenance.');$('docxScope'+side.toUpperCase()).value=scope;}
 const requestedOdt=data.options.odtScopes;if(requestedOdt!==undefined&&(!requestedOdt||typeof requestedOdt!=='object'||Array.isArray(requestedOdt)||Object.keys(requestedOdt).some(key=>!['a','b'].includes(key))||!['a','b'].every(side=>['main-document','main-and-related-text'].includes(requestedOdt[side]))))throw Error('Invalid ODT text scopes.');for(const side of ['a','b']){const scope=requestedOdt?.[side]||'main-document',projection=data.files[side].documentProjection;if(projection?.kind==='odt'&&projection.scope!==scope)throw Error('ODT text scope disagrees with saved extraction provenance.');$('odtScope'+side.toUpperCase()).value=scope;}
 const requestedDoc=data.options.docScopes;if(requestedDoc!==undefined&&(!requestedDoc||typeof requestedDoc!=='object'||Array.isArray(requestedDoc)||Object.keys(requestedDoc).some(key=>!['a','b'].includes(key))||!['a','b'].every(side=>['main-document','main-and-related-text'].includes(requestedDoc[side]))))throw Error('Invalid DOC text scopes.');for(const side of ['a','b']){const scope=requestedDoc?.[side]||'main-document',projection=data.files[side].documentProjection;if(projection?.kind==='doc'&&projection.scope!==scope)throw Error('DOC text scope disagrees with saved extraction provenance.');$('docScope'+side.toUpperCase()).value=scope;}
 const requestedPdf=data.options.pdfOrders;if(requestedPdf!==undefined&&(!requestedPdf||typeof requestedPdf!=='object'||Array.isArray(requestedPdf)||Object.keys(requestedPdf).some(key=>!['a','b'].includes(key))||!['document','page-rows','page-columns','tagged-structure'].includes(requestedPdf.a)||!['document','page-rows','page-columns','tagged-structure'].includes(requestedPdf.b)))throw Error('Invalid PDF reading orders.');for(const side of ['a','b'])$('pdfOrder'+side.toUpperCase()).value=data.files[side].documentProjection?.kind==='pdf'?(data.files[side].documentProjection.order||'document'):(requestedPdf?.[side]??'document');
 const requestedRead=data.options.readEncodings;if(requestedRead!==undefined&&(!requestedRead||typeof requestedRead!=='object'||Array.isArray(requestedRead)||Object.keys(requestedRead).some(key=>!['a','b'].includes(key))||!['auto',...ENCODINGS].includes(requestedRead.a)||!['auto',...ENCODINGS].includes(requestedRead.b)))throw Error('Invalid requested read encodings.');for(const side of ['a','b']){const known=data.options.textInputEncodings?.[side];$('readEncoding'+side.toUpperCase()).value=requestedRead?.[side]??(['auto',...ENCODINGS].includes(known)?known:'auto');}
 $('textProfile').value=validateTextProfile(data.options.textProfile);textGrammar=validateTextGrammar(data.options.textGrammar);textProfileMappings=validateTextProfileMappings(data.options.textProfileMappings);ignoredTextPatterns=validateIgnoredTextPatterns(data.options.ignoredTextPatterns);folderTreeRevision=null;folderIgnoredMarks=[];folderAlignmentPairs=data.options.folderAlignment||[];folderNameRules=validateFolderNameRules(data.options.folderNameRules);const restoredAlignment=engine.validateAnchors(data.options.textAlignment??[],normalizeText(data.text.a),normalizeText(data.text.b));folderScanInfo={state:'loaded',skipped:0};folderRules={mode:'content',timeToleranceMs:0,...data.options.folderRules};setArea('a',data.text.a,data.options.textFormats?.a||defaultFormat());setArea('b',data.text.b,data.options.textFormats?.b||defaultFormat());textAlignment=restoredAlignment;alignment.reset();folderViewState={mode:['flat','recursive','filename'].includes(data.options.folderView?.mode)?data.options.folderView.mode:'tree',sort:['name','path','size-left','size-right','modified-left','modified-right'].includes(data.options.folderView?.sort)?data.options.folderView.sort:'name',descending:data.options.folderView?.descending===true,alwaysShowFolders:data.options.folderView?.alwaysShowFolders===true,...(data.options.folderView?.refreshIntervalMs!==undefined?{refreshIntervalMs:validateRefreshInterval(data.options.folderView.refreshIntervalMs)}:{}),...(data.options.folderView?.hideLegend!==undefined?{hideLegend:data.options.folderView.hideLegend}:{})};restoreTextTools(data.options.textTools||null);$('folderInclude').value=data.options.folderInclude??'*';$('folderExclude').value=data.options.folderExclude??'';$('folderSearch').value=data.options.folderSearch??'';files=data.files;folders=restoredFolders(data);sources={a:null,b:null};localEdits={a:true,b:true};$('sessionName').value=data.name;$('ignoreWhitespace').checked=data.options.ignoreWhitespace===true;$('ignoreCase').checked=data.options.ignoreCase===true;$('ignoreBlankLines').checked=data.options.ignoreBlankLines===true;$('showMovedBlocks').checked=data.options.showMovedBlocks===true;$('syntaxAlignment').checked=data.options.syntaxAlignment===true;$('whitespaceScope').value=data.options.whitespaceScope??'all';$('showMinor').checked=data.options.showMinor===true;$('minorCount').textContent='';filter=data.options.filter;$('folderDirection').value=data.options.direction==='b-to-a'?'b-to-a':'a-to-b';$('folderSyncMode').value=data.options.folderSyncMode||'mirror';savedPath=path;sessionLocked=!!desktop&&!!path&&data.locked===true;$('sessionLocation').textContent=path.split(/[\\/]/).pop();$('sessionLocation').title=path;folderRows=[];expandedFolders=new Set();sideSelection={a:new Set(),b:new Set()};selection.clear();undo=[];redo=[];invalidate();await setType(data.type,false,data.type==='folder-merge3'?(threeWayRuntime||data.threeWay||null):data.advanced||null,archiveRuntime,binaryRuntime,tableRuntime,mergeRuntime);showInputs();folderTable();markDirty(false);if(!isFolder())compute();}
async function saveWorkspace(){if(!desktop)return;snapshot();if(!tabs.size)throw Error('Open a comparison before saving a workspace.');const entries=[...tabs].map(([id,tab])=>({id,data:tab.data}));const out=await desktop.saveWorkspace({entries,activeIndex:Math.max(0,entries.findIndex(entry=>entry.id===activeId))});if(!out.cancelled)notify('Workspace saved with '+entries.length+' comparisons.');}
async function openWorkspace(){const loaded=await lockedWorkspaceInput(async()=>{if(!desktop)return;stopExpansion();snapshot();const previous=activeId,prior=tabs.get(previous),out=await desktop.openWorkspace();if(!out)return;try{for(const entry of out.entries){await desktop.activateSession(entry.id);await newSessionUnlocked(entry.data.type,entry.id,{restoring:true});await restore(entry.data,'');snapshot();}await switchTabUnlocked(out.entries[out.activeIndex].id);notify('Workspace opened: '+out.entries.length+' comparisons.');return true;}catch(error){await rollbackWorkspace(previous,prior,error,out.entries.map(entry=>entry.id));}});if(loaded&&isFolder()&&folders.a&&folders.b)await scan();}
async function openSession(){if(!desktop){$('sessionFile').click();return;}const loaded=await lockedWorkspaceInput(async()=>{snapshot();const previous=activeId,prior=tabs.get(previous);await newSessionUnlocked();const opened=activeId;try{const out=await desktop.openSession();if(out){await restore(out.data,out.path);snapshot();return true;}}catch(error){await rollbackWorkspace(previous,prior,error,opened);}await rollbackWorkspace(previous,prior,null,opened);});if(loaded&&isFolder()&&folders.a&&folders.b)await scan();}
let folderScanInfo={state:'loaded',skipped:0},folderRules={mode:'content',timeToleranceMs:0},folderViewState={mode:'tree',sort:'name',descending:false},parentTabId=null;
const isFolderTextRule=mode=>['text-content','text-whitespace','text-case','text-whitespace-case'].includes(mode);
const folderTextIgnored=(mode,scope=folderRules.textWhitespaceScope||'horizontal')=>mode==='text-content'?'encoding':mode==='text-case'?'case':(mode==='text-whitespace-case'?'case, ':'')+whitespaceScopeLabel(scope);
const pendingFolderWhitespace=new Map(),pendingFolderBlankLines=new Map();
const folderUnixMetadataKeys=['comparePermissions','compareOwner','compareGroup'];
const folderMetadataKeys=['compareFilename',...folderUnixMetadataKeys];
const pendingFolderMetadata=new Map();
const folderNameKeys=['ignoreCase','normalizeUnicode','ignoreExtension'],pendingFolderNames=new Map();
const folderNameControl=key=>$('folderName'+key[0].toUpperCase()+key.slice(1));
function folderNameControls(){for(const key of folderNameKeys){const control=folderNameControl(key);control.checked=pendingFolderNames.get(activeId)?.get(key)?.value??(folderNameRules[key]===true);control.disabled=!desktop||folderViewState.mode==='filename';}$('folderNameRulesNote').textContent=folderViewState.mode==='filename'?'These options apply to tree matching. Filename matching across folders uses its separate matching rules.':'Pairs full names first inside each opened folder. Extension matching pairs files with the same stem before the final extension. Ambiguous names remain unpaired; actual filenames are preserved.';}
function openFolderNameOptions(){const id=activeId;compactFolderLayout.open();setTimeout(()=>{if(activeId===id&&$('folderOptionsDialog').open)(folderViewState.mode==='filename'?$('folderViewMode'):folderNameControl('ignoreCase')).focus();},0);}
async function setFolderNameRules(rules){if(folderViewState.mode==='filename')throw Error('Switch to Tree view to change filename matching.');stopExpansion();const result=await desktop.setFolderNameRules(rules,folderTreeRevision);folderNameRules=validateFolderNameRules(rules);folderRootEpoch++;folderTreeRevision=result.revision;folderRows=[];expandedFolders.clear();folderIgnoredMarks=[];sideSelection={a:new Set(),b:new Set()};selectionAnchor={a:null,b:null};plan=null;markDirty();await scan();snapshot();}
const folderTimestampKeys=['ignoreDaylightSaving','ignoreTimezone'];
const pendingFolderTimestamp=new Map();
const folderTimestampFields=rules=>Object.fromEntries(folderTimestampKeys.filter(key=>rules?.[key]===true).map(key=>[key,true]));
const folderMetadataLabels={filename:'Filename spelling',permissions:'Permissions',owner:'Owner (UID)',group:'Group (GID)'};
const folderMetadataFields=rules=>Object.fromEntries(folderMetadataKeys.filter(key=>rules?.[key]===true).map(key=>[key,true]));
const pendingFolderRefresh=new Map();
function openFolderAutoRefreshOptions(){const id=activeId;compactFolderLayout.open();setTimeout(()=>{if(activeId===id&&$('folderOptionsDialog').open)$('folderAutoRefresh').focus();},0);}
function setFolderAutoRefresh(value){folderViewState.refreshIntervalMs=validateRefreshInterval(value);folderViewControls();markDirty();}
function openFolderTimestampOptions(){const id=activeId;compactFolderLayout.open();setTimeout(()=>{if(activeId===id&&$('folderOptionsDialog').open)$(folderRules.mode.includes('modified')?'folderIgnoreDaylightSaving':'folderCompareMode').focus();},0);}
function openFolderMetadataOptions(){const id=activeId;compactFolderLayout.open();setTimeout(()=>{if(activeId===id&&$('folderOptionsDialog').open)$(desktop?.platform==='win32'?'folderCompareFilename':'folderComparePermissions').focus();},0);}
function folderRuleControls(){$('folderTextProfile').value=folderRules.textProfile||'plain';$('folderTextProfile').disabled=!isFolderTextRule(folderRules.mode);$('folderIgnoredText').disabled=!isFolderTextRule(folderRules.mode);$('folderIgnoredText').textContent='Ignored text'+(folderRules.ignoredTextPatterns?.length?' ('+folderRules.ignoredTextPatterns.length+')':'')+'…';$('folderIgnoreBlankLines').checked=pendingFolderBlankLines.get(activeId)?.value??folderRules.ignoreBlankLines===true;$('folderIgnoreBlankLines').disabled=!isFolderTextRule(folderRules.mode);$('folderTextWhitespaceScope').value=pendingFolderWhitespace.get(activeId)?.value??folderRules.textWhitespaceScope??'horizontal';$('folderTextWhitespaceScope').disabled=!['text-whitespace','text-whitespace-case'].includes(folderRules.mode);for(const key of folderTimestampKeys){const control=$('folder'+key[0].toUpperCase()+key.slice(1));control.checked=pendingFolderTimestamp.get(activeId)?.get(key)?.value??(folderRules[key]===true);control.disabled=!folderRules.mode.includes('modified');}for(const key of folderMetadataKeys){const control=$('folder'+key[0].toUpperCase()+key.slice(1));control.checked=pendingFolderMetadata.get(activeId)?.get(key)?.value??(folderRules[key]===true);control.disabled=!desktop||(desktop.platform==='win32'&&folderUnixMetadataKeys.includes(key));}$('folderDisableUnixChecks').hidden=desktop?.platform!=='win32'||!folderUnixMetadataKeys.some(key=>folderRules[key]);$('folderMetadataNote').textContent=desktop?.platform==='win32'?'Unix permission, owner and group comparison is unavailable on Windows. Disable imported Unix checks to compare this session here.': 'Compare Unix permission bits and numeric owner/group IDs for files and folders. These rules do not change permissions or ownership.';$('folderCompareMode').value=folderRules.mode;if(document.activeElement!==$('folderTimeTolerance'))$('folderTimeTolerance').value=folderRules.timeToleranceMs/1000;$('folderToleranceLabel').hidden=!folderRules.mode.includes('modified');$('folderRulesHint').textContent=isFolderTextRule(folderRules.mode)?`Text (${'Left '+folderEncodingName(folderEncodings(folderRules).a)+' / Right '+folderEncodingName(folderEncodings(folderRules).b)}): ${folderTextIgnored(folderRules.mode).replace('spaces and tabs','spaces/tabs')} and line-ending styles ignored; ${folderRules.ignoreBlankLines?'empty or spaces/tabs-only lines ignored; final newline after text retained':'blank lines and final newline retained'}. Binary, undecodable or over 10 MiB: exact bytes.`:folderRules.mode==='content'?'File contents are verified.':'Metadata only — matching metadata does not verify file contents.';if(folderRules.mode.includes('modified')){const exceptions=folderRules.ignoreTimezone?'whole-hour differences':folderRules.ignoreDaylightSaving?'one-hour differences':null;if(exceptions)$('folderRulesHint').textContent+=' Timestamp comparison ignores '+exceptions+' within tolerance; displayed dates and newer-file direction are unchanged.';}const metadataNames=folderMetadataKeys.filter(key=>folderRules[key]).map(key=>({compareFilename:'filename spelling',comparePermissions:'permissions',compareOwner:'owner UID',compareGroup:'group GID'})[key]);if(isFolderTextRule(folderRules.mode)&&folderRules.textProfile&&folderRules.textProfile!=='plain')$('folderRulesHint').textContent+=folderRules.textProfile==='auto'?' Filename formats are chosen per pair; unknown or conflicting formats use plain text.':' '+folderRules.textProfile.toUpperCase()+' grammar rules apply; original file bytes are retained.';if(metadataNames.length)$('folderRulesHint').textContent+=' Also compare '+metadataNames.join(', ')+'.';document.querySelector('.text-normalized-legend').hidden=!isFolderTextRule(folderRules.mode);document.querySelector('.folder-legend .equal').textContent=isFolderTextRule(folderRules.mode)?'Byte match':folderRules.mode==='content'?'Same content':'Metadata match';}
async function setFolderRules(mode=folderRules.mode,tolerance=$('folderTimeTolerance').value,encodingRules=folderEncodingFields(folderRules),metadataRules=folderRules,timestampRules=folderRules,whitespaceScope=folderRules.textWhitespaceScope||'horizontal',ignoreBlankLines=folderRules.ignoreBlankLines===true){const seconds=Number(tolerance),milliseconds=Math.round(seconds*1000);if(!['content','text-content','text-whitespace','text-case','text-whitespace-case','size','modified','size-modified'].includes(mode)||!Number.isFinite(seconds)||Math.abs(seconds*1000-milliseconds)>0.000001||seconds<0||seconds>86400){folderRuleControls();throw Error('Choose a comparison method and a tolerance from 0 to 86400 seconds, in millisecond increments.');}if(typeof ignoreBlankLines!=='boolean')throw Error('Invalid blank line comparison rule.');if(!WHITESPACE_SCOPES.includes(whitespaceScope))throw Error('Invalid whitespace comparison scope.');stopExpansion();folderIgnoredMarks=[];folderRootEpoch++;folderRules={mode,timeToleranceMs:milliseconds,...(hasTextGrammar(folderRules.textGrammar)?{textGrammar:validateTextGrammar(folderRules.textGrammar)}:{}),...(folderRules.textProfileMappings?.length?{textProfileMappings:structuredClone(folderRules.textProfileMappings)}:{}),...(folderRules.textProfile&&folderRules.textProfile!=='plain'?{textProfile:folderRules.textProfile}:{}),...(folderRules.ignoredTextPatterns?.length?{ignoredTextPatterns:folderRules.ignoredTextPatterns}:{}),...(ignoreBlankLines?{ignoreBlankLines:true}:{}),...(whitespaceScope!=='horizontal'?{textWhitespaceScope:whitespaceScope}:{}),...folderEncodingFields(encodingRules),...folderMetadataFields(metadataRules),...folderTimestampFields(timestampRules)};folderRows=[];folderRuleControls();markDirty();await scan();}
const folderEncodingDialog=createFolderEncodingDialog();
async function editFolderEncoding(){const id=activeId,value=await folderEncodingDialog.open(folderRules);if(value===null||id!==activeId||!isFolder())return;await setFolderRules(folderRules.mode,folderRules.timeToleranceMs/1000,value);focusFolderRow(folderFocus.side,folderFocus.path);}
const folderToleranceDialog=createFolderToleranceDialog();
async function editFolderTolerance(){const id=activeId,value=await folderToleranceDialog.open(folderRules.timeToleranceMs);if(value===null||id!==activeId||!isFolder())return;await setFolderRules(folderRules.mode,value);focusFolderRow(folderFocus.side,folderFocus.path);if(!folderFocus.path)$('folderRows'+folderFocus.side.toUpperCase()).focus();}
function folderViewControls(){folderNameControls();folderRuleControls();$('folderAutoRefresh').value=String(pendingFolderRefresh.get(activeId)?.value??validateRefreshInterval(folderViewState.refreshIntervalMs));document.querySelector('.folder-legend').hidden=folderViewState.hideLegend===true;
 $('folderAlwaysShow').setAttribute('aria-pressed',String(folderViewState.alwaysShowFolders===true));$('folderAlwaysShow').disabled=folderViewState.mode!=='tree';
 $('folderOperationScope').value=folderAllContentsTabs.has(activeId)?'all':'filtered';
 $('folderViewMode').value=folderViewState.mode;$('folderSort').value=folderViewState.sort;$('folderSortOrder').textContent=folderViewState.descending?'Descending':'Ascending';$('folderViewHint').textContent=folderViewState.mode==='flat'?'Loaded files only — expand folders in Tree view to include more.':folderViewState.mode==='recursive'?'All subfolders · Refresh to rescan.':folderViewState.mode==='filename'?'Paired by filename across folders · Actual paths shown · Refresh to rematch.':'';
 for(const button of document.querySelectorAll('[data-folder-sort]')){const selected=button.dataset.folderSort===folderViewState.sort;button.setAttribute('aria-pressed',String(selected));button.textContent=button.dataset.label+(selected?(folderViewState.descending?' ↓':' ↑'):'');}
 $('backToFolder').textContent=tabs.get(parentTabId)?.data?.type==='archive-compare'?'← Back to archive':'← Back to folder';$('backToFolder').hidden=!parentTabId;$('backToFolder').disabled=!parentTabId||!tabs.has(parentTabId);$('backToFolder').title=parentTabId&&tabs.has(parentTabId)?'Return to '+tabs.get(parentTabId).name:'The parent folder session has been closed';
}
async function setFolderView(mode){stopExpansion();if(disconnectedFolders()){folderViewState.mode=['flat','recursive','filename'].includes(mode)?mode:'tree';folderTable();markDirty();return;}const previous=folderViewState.mode;if(mode==='filename'&&(folders.a||folders.b)){if(await scanFilenameMatching())markDirty();return;}if(previous==='filename'&&mode!=='filename'){await desktop.setFolderMatching('path',crypto.randomUUID());folderTreeRevision=null;expandedFolders.clear();}folderViewState.mode=['flat','recursive','filename'].includes(mode)?mode:'tree';$('folderExpandStatus').textContent='';if(mode==='recursive'||previous==='recursive'||previous==='filename')await scan();else folderTable();markDirty();}
function setFolderSort(value,toggle=false){if(!['name','path','size-left','size-right','modified-left','modified-right'].includes(value))return;folderViewState.descending=toggle&&folderViewState.sort===value?!folderViewState.descending:false;folderViewState.sort=value;folderTable();markDirty();}
function folderRowPath(row,side=null){return side?row?.[side==='a'?'pathA':'pathB']||'':row?.pathA||row?.pathB||'';}
function folderRowName(row,side=null){return side?row?.[side==='a'?'nameA':'nameB']||'':row?.nameA||row?.nameB||'';}
function expandableFolder(row){return !row.alignmentConflict&&(row.kindA==='directory'||row.kindB==='directory');}
const activeFolderReads=new Map(),stoppedFolderComparisons=new Set();let folderStopSerial=0;
async function trackedFolderRead(work,{acceptCommitted=false}={}){
 const ticket={sessionId:activeId,revision:folderTreeRevision,requestId:crypto.randomUUID()},request={ticket,stopped:false,task:expansionTask};activeFolderReads.set(ticket.requestId,request);expansionControls();
 try{const result=await work(ticket);if(request.stopped&&!(acceptCommitted&&result?.id))throw Error('Comparison stopped.');return result;}
 catch(error){if(request.stopped){const stopped=Error('Comparison stopped.');stopped.code='ABORT_ERR';throw stopped;}throw error;}
 finally{activeFolderReads.delete(ticket.requestId);expansionControls();}
}
async function openTrackedFolderFile(work){
 if(!folders.a?.remote&&!folders.b?.remote)return work(undefined);
 const context=folderActionContext(),stopSerial=folderStopSerial;
 // Native row resolution must not race a background comparison publishing the
 // same node. The enclosing UI operation prevents another comparison starting.
 while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));
 if(stopSerial!==folderStopSerial){const error=Error('Comparison stopped.');error.code='ABORT_ERR';throw error;}
 if(context!==folderActionContext())throw Error('Folder selection changed. Open the file again.');
 return trackedFolderRead(work,{acceptCommitted:true});
}
async function readFolderNode(node='root',compare=false,fresh=false){
 const stopSerial=folderStopSerial;
 if(compare&&(fresh||!folderTreeRevision)){await readFolderNode('root',false,true);fresh=false;}
 if(stopSerial!==folderStopSerial)throw Error('Folder comparison stopped.');
 const context=activeId,epoch=folderRootEpoch,requestedRevision=fresh?null:folderTreeRevision;
 const ticket={sessionId:context,revision:requestedRevision,requestId:crypto.randomUUID()},request={ticket,stopped:false,task:expansionTask};activeFolderReads.set(ticket.requestId,request);expansionControls();
 try{
 const data=compare?await desktop.compareFolderTree(node,requestedRevision,folderRules,ticket):await desktop.listFolderTree(node,requestedRevision,ticket);
 if(request.stopped||stopSerial!==folderStopSerial)throw Error('Folder comparison stopped.');
 if(context!==activeId||epoch!==folderRootEpoch||!isFolder())throw Error('Folder view changed while reading.');
 folderTreeRevision=data.revision;if(Array.isArray(data.pairs))folderAlignmentPairs=data.pairs.map(pair=>({...pair}));
 return data;
 }catch(error){if(request.stopped){const stopped=Error('Comparison stopped.');stopped.code='ABORT_ERR';throw stopped;}throw error;}finally{activeFolderReads.delete(ticket.requestId);expansionControls();}
}
function orderedFolderRows(rows){
 const sort=folderViewState.sort,descending=folderViewState.descending?-1:1;
 const compare=(a,b)=>{if(folderViewState.mode==='tree'){const ad=expandableFolder(a),bd=expandableFolder(b);if(ad!==bd)return ad?-1:1;}
  let delta;if(sort==='name'||sort==='path')delta=(sort==='name'?folderRowName(a):folderRowPath(a)).localeCompare(sort==='name'?folderRowName(b):folderRowPath(b),undefined,{numeric:true,sensitivity:'base'});else{const field=(sort.startsWith('size')?'size':'mtime')+(sort.endsWith('left')?'A':'B');delta=(a[field]??-1)-(b[field]??-1);}return delta?delta*descending:a.id.localeCompare(b.id);};
 if(folderViewState.mode!=='tree')return rows.filter(row=>row.kindA==='file'||row.kindB==='file').sort(compare).map(row=>({...row,depth:0}));
 const groups=new Map();for(const row of rows){const parent=row.parentId;if(!groups.has(parent))groups.set(parent,[]);groups.get(parent).push(row);}for(const children of groups.values())children.sort(compare);
 const out=[],seen=new Set();const walk=(parent,depth)=>{for(const row of groups.get(parent)||[]){if(seen.has(row.id))continue;seen.add(row.id);out.push({...row,depth});walk(row.id,depth+1);}};walk('root',0);return out;
}
const folderSuppressedTabs=new Set(),folderAllContentsTabs=new Set();
function setFolderOperationScope(value){if(value==='all')folderAllContentsTabs.add(activeId);else folderAllContentsTabs.delete(activeId);$('folderOperationScope').value=folderAllContentsTabs.has(activeId)?'all':'filtered';}
$('folderOperationScope').onchange=()=>setFolderOperationScope($('folderOperationScope').value);
function folderFilterOptions(suppressed=folderSuppressedTabs.has(activeId)){return {alwaysShowFolders:folderViewState.mode==='tree'&&folderViewState.alwaysShowFolders===true,retainDirectories:folderViewState.mode==='tree',include:suppressed?'*':$('folderInclude').value,exclude:suppressed?'':$('folderExclude').value,query:suppressed?'':$('folderSearch').value,status:suppressed?'all':filter};}
function ignoredFolderRows(){if(!folderIgnoredMarks.length)return folderRows;folderIgnoredMarks=pruneIgnoredMarks(folderRows,folderIgnoredMarks);return projectIgnoredRows(folderRows,folderIgnoredMarks);}
function visibleFolders(){const rows=ignoredFolderRows(),filtered=filterEntries(rows,folderFilterOptions(false));if(!folderSuppressedTabs.has(activeId))return orderedFolderRows(filtered);const included=new Set(filtered.map(row=>row.id));return orderedFolderRows(rows).map(row=>({...row,filterSuppressed:!included.has(row.id)}));}
function toggleFolderLegend(){folderViewState.hideLegend=!folderViewState.hideLegend;document.querySelector('.folder-legend').hidden=folderViewState.hideLegend;markDirty();}
function toggleAlwaysShowFolders(){folderViewState.alwaysShowFolders=!folderViewState.alwaysShowFolders;folderTable();markDirty();}
function toggleFolderFilters(){if(folderSuppressedTabs.has(activeId))folderSuppressedTabs.delete(activeId);else folderSuppressedTabs.add(activeId);folderTable();notify(folderSuppressedTabs.has(activeId)?'Filters temporarily bypassed. Revealed entries have a teal marker.':'Filters restored.');}

async function backToFolder(){if(parentTabId&&tabs.has(parentTabId))await switchTab(parentTabId);}
const EXPAND_NODE_LIMIT=5000,EXPAND_ENTRY_LIMIT=50000;
let expansionTask=null,expansionSerial=0,folderTransferTask=null;
function expansionControls(){const running=Boolean(expansionTask);$('folderExpandAll').disabled=disconnectedFolders()||running||['recursive','filename'].includes(folderViewState.mode)||(!folders.a&&!folders.b);$('folderStop').disabled=!running&&![...activeFolderReads.values()].some(read=>read.ticket.sessionId===activeId&&!read.stopped)&&!folderCompareRequested&&!folderTransferTask;}
function stopExpansion(reason='Expansion stopped',explicit=false){
 const task=expansionTask;if(!task&&!explicit)return;
 if(explicit&&folderTransferTask)void cancelActiveFolderTransfer();
 if(explicit){folderStopSerial++;stoppedFolderComparisons.add(activeId);clearTimeout(folderCompareTimer);folderCompareRequested=false;}
 for(const read of activeFolderReads.values())if(read.ticket.sessionId===activeId&&!read.stopped&&(explicit||read.task===task)){read.stopped=true;if(desktop?.cancelFolderRead)void desktop.cancelFolderRead(read.ticket).catch(error=>notify(error.message,true));}
 if(task?.kind==='filename'){task.cancelled=true;void desktop.cancelFolderMatching(task.request).catch(error=>notify(error.message,true));$('folderExpandStatus').textContent='Stopping filename matching…';return;}
 expansionTask=null;expansionSerial++;folderScanInfo={...folderScanInfo,state:'partial'};expansionControls();if(isFolder())$('folderExpandStatus').textContent=task?.kind==='recursive'?'Partial files · stopped — Refresh to rescan.':reason;
}
async function scanFilenameMatching(){
 if(disconnectedFolders()||!desktop||!activeId||!isFolder()||(!folders.a&&!folders.b))return false;
 if(expansionTask?.kind==='filename')return false;stopExpansion();
 stoppedFolderComparisons.delete(activeId);const task={id:activeId,kind:'filename',request:crypto.randomUUID(),previousInfo:{...folderScanInfo}};expansionTask=task;folderRootEpoch++;clearTimeout(folderCompareTimer);folderCompareRequested=false;folderScanInfo={...folderScanInfo,state:'running'};expansionControls();$('folderExpandStatus').textContent='Scanning filenames across folders…';
 try{const data=await desktop.setFolderMatching('filename',task.request);if(data.cancelled){folderScanInfo=task.previousInfo;$('folderExpandStatus').textContent='Filename matching cancelled · Previous comparison retained.';return false;}if(activeId!==task.id)return false;
 folderViewState.mode='filename';folderTreeRevision=data.revision;folderAlignmentPairs=data.pairs||[];folderRows=data.rows.map(row=>({...row,depth:0}));folderIgnoredMarks=[];expandedFolders.clear();folderScanInfo={...data.scan,state:'complete',skipped:data.skipped||0};plan=null;folderDifferenceId=null;folderSummaryCache.reset();
 const info=data.diagnostics||{};$('folderExpandStatus').textContent=`${folderRows.length.toLocaleString()} file pairs / one-sided entries${info.duplicateGroups?' · '+info.duplicateGroups+' duplicate-name groups (path order)':''}${data.skipped?' · '+data.skipped+' skipped':''}`;folderTable();folderSummary();queueFolderComparison();return true;
 }catch(error){folderScanInfo=task.previousInfo;$('folderExpandStatus').textContent='Filename matching failed · Previous comparison retained.';folderViewControls();throw error;}
 finally{if(expansionTask===task)expansionTask=null;expansionControls();folderViewControls();}
}
if(desktop?.onFolderTransferProgress)desktop.onFolderTransferProgress(progress=>{const task=folderTransferTask;if(task?.phase==='execute'&&task.sessionId===progress.sessionId&&task.planId===progress.planId&&!task.stopping){$('planTitle').textContent=`Transferring · ${progress.completed+progress.skipped} / ${progress.total} steps`;}});
if(desktop?.onFolderMatchingProgress)desktop.onFolderMatchingProgress(progress=>{const task=expansionTask;if(task?.kind==='filename'&&task.request===progress.request&&!task.cancelled)$('folderExpandStatus').textContent=`Scanning filenames · ${progress.nodes.toLocaleString()} folders · ${progress.entries.toLocaleString()} entries`;});
function startRecursiveListing(){
 if(disconnectedFolders()||!desktop||!activeId||!isFolder()||(!folders.a&&!folders.b))return;
 stopExpansion();stoppedFolderComparisons.delete(activeId);const task={id:activeId,serial:++expansionSerial,kind:'recursive',rootEpoch:folderRootEpoch};expansionTask=task;folderScanInfo={state:'running',skipped:0};
 const current=()=>expansionTask===task&&activeId===task.id&&isFolder()&&folderViewState.mode==='recursive'&&folderRootEpoch===task.rootEpoch;
 folderRows=[];sideSelection={a:new Set(),b:new Set()};selection.clear();folderFocus.path=null;folderTable();folderSummary();$('folderExpandStatus').textContent='Scanning all files…';
 void(async()=>{let nodes=0,entries=0,lastPaint=0;try{const outcome=await walkFolders({root:'root',listNode:async node=>{const data=await readFolderNode(node,true,node==='root');if(current())folderScanInfo.skipped+=(data.skipped||0);return data;},isCancelled:()=>!current(),maxNodes:EXPAND_NODE_LIMIT,maxEntries:EXPAND_ENTRY_LIMIT,onNode:async(node,rows)=>{if(!current())return;nodes++;entries+=rows.length;folderScanInfo.nodes=nodes;folderScanInfo.entries=entries;folderRows.push(...rows.map(row=>({...row,depth:0})));if(performance.now()-lastPaint>80){folderTable();folderSummary();lastPaint=performance.now();}$('folderExpandStatus').textContent=`Scanning all files · ${nodes.toLocaleString()} folders · ${entries.toLocaleString()} entries`;await new Promise(resolve=>setTimeout(resolve,0));}});if(!current())return;expansionTask=null;folderScanInfo={...outcome,state:outcome.complete?'complete':'partial'};folderTable();folderSummary();$('folderExpandStatus').textContent=`${outcome.complete?'All files':'Partial files · limit reached'} · ${outcome.nodes.toLocaleString()} folders · ${outcome.entries.toLocaleString()} entries${outcome.skipped?' · '+outcome.skipped.toLocaleString()+' skipped':''}`;}catch(error){if(current()){expansionTask=null;folderScanInfo={...folderScanInfo,state:'partial'};folderTable();folderSummary();$('folderExpandStatus').textContent='Partial files · scan failed — Refresh to retry.';notify(error.message,true);}}})();
}
function startExpansion(root='root'){
 if(['recursive','filename'].includes(folderViewState.mode))return;
 if(root!=='root'){const row=folderRows.find(item=>item.id===root);if(row?.alignmentConflict)throw Error('This aligned entry changed type. Clear its alignment before expanding.');if(!row||!expandableFolder(row))throw Error('Select a folder to expand.');}
 if(disconnectedFolders()||!desktop||!activeId||!isFolder()||(!folders.a&&!folders.b))return;
 stopExpansion();stoppedFolderComparisons.delete(activeId);const task={id:activeId,serial:++expansionSerial,root};expansionTask=task;folderScanInfo={state:'running',skipped:0};expansionControls();$('folderExpandStatus').textContent='Expanding folders…';
 const current=()=>expansionTask===task&&activeId===task.id&&isFolder();
 const cache=new Map([['root',[]]]);for(const path of expandedFolders)cache.set(path,[]);for(const row of folderRows){const parent=row.parentId;if(!cache.has(parent))cache.set(parent,[]);cache.get(parent).push(row);}
 const publish=()=>{if(!current())return;const output=[];const visit=(path,depth)=>{for(const row of cache.get(path)||[]){if(output.length>=EXPAND_ENTRY_LIMIT)return;output.push({...row,depth});if(expandedFolders.has(row.id)&&depth<EXPAND_NODE_LIMIT)visit(row.id,depth+1);}};visit('root',0);folderRows=output;folderTable();folderSummary();};
 void(async()=>{
  const queue=[root],visited=new Set();let entries=0,cacheEntries=folderRows.length,limited=false,lastPaint=performance.now();
  try{
   while(queue.length&&current()){
    if(visited.size>=EXPAND_NODE_LIMIT){limited=true;break;}
    const path=queue.shift();if(visited.has(path))continue;visited.add(path);
    const data=await readFolderNode(path,false,path==='root');if(!current())return;folderScanInfo.skipped+=data.skipped||0;
    if(entries+data.rows.length>EXPAND_ENTRY_LIMIT||cacheEntries-(cache.get(path)?.length||0)+data.rows.length>EXPAND_ENTRY_LIMIT){limited=true;break;}
    entries+=data.rows.length;cacheEntries+=data.rows.length-(cache.get(path)?.length||0);cache.set(path,data.rows);if(path!=='root')expandedFolders.add(path);
    for(const row of data.rows)if(expandableFolder(row))queue.push(row.id);
    if(performance.now()-lastPaint>80||visited.size%20===0){publish();$('folderExpandStatus').textContent=`Expanding · ${visited.size.toLocaleString()} folders · ${entries.toLocaleString()} entries`;lastPaint=performance.now();await new Promise(resolve=>setTimeout(resolve,0));}
   }
   if(!current())return;publish();expansionTask=null;folderScanInfo={...folderScanInfo,state:limited?'partial':'loaded'};expansionControls();$('folderExpandStatus').textContent=limited?`Expansion limit reached (${EXPAND_NODE_LIMIT.toLocaleString()} folders / ${EXPAND_ENTRY_LIMIT.toLocaleString()} entries). Expand a smaller subtree.`:`Expanded ${visited.size.toLocaleString()} folders · ${entries.toLocaleString()} entries`;queueFolderComparison();
  }catch(error){if(current()){publish();expansionTask=null;folderScanInfo={...folderScanInfo,state:'partial'};expansionControls();$('folderExpandStatus').textContent='Expansion stopped';notify(error.message,true);queueFolderComparison();}}
 })();
}
async function collapseSubtree(id='root'){if(['recursive','filename'].includes(folderViewState.mode))return;stopExpansion();const remove=new Set([id]);for(let changed=true;changed;){changed=false;for(const row of folderRows)if(remove.has(row.parentId)&&!remove.has(row.id)){remove.add(row.id);changed=true;}}for(const entry of [...expandedFolders])if(id==='root'||remove.has(entry))expandedFolders.delete(entry);$('folderExpandStatus').textContent='';await scan(false,true);}
function applySelectionRule(rule,side=folderFocus.side){
 if(rule==='left-only'||rule==='newer-left')side='a';if(rule==='right-only'||rule==='newer-right')side='b';
 const rows=visibleFolders(),previous=sideSelection;sideSelection={a:new Set(),b:new Set()};
 if(['files-both','one-sided-both','newer-both'].includes(rule)){
  for(const targetSide of ['a','b']){sideSelection[targetSide]=selectEntries(rows,targetSide,rule,previous[targetSide]);selectionAnchor[targetSide]=rows.find(row=>sideSelection[targetSide].has(row.id))?.id||null;}
  if(!sideSelection[side].size&&sideSelection[side==='a'?'b':'a'].size)side=side==='a'?'b':'a';
 }else sideSelection[side]=selectEntries(rows,side,rule,previous[side]);
 const candidates=rows.filter(row=>row[side==='a'?'kindA':'kindB']);
 const target=candidates.find(row=>row.id===folderFocus.path&&sideSelection[side].has(row.id))||candidates.find(row=>sideSelection[side].has(row.id))||candidates.find(row=>row.id===folderFocus.path)||candidates[0];
 selectionAnchor[side]=target?.id||null;
 focusFolderRow(side,target?.id||null);
 if(target)document.activeElement?.scrollIntoView({block:'nearest'});else $('folderRows'+side.toUpperCase()).focus();
}
const filenameSearchDialog=createFilenameSearchDialog(),filenameSearchStates=new Map();
function filenameSearchEntries(){return visibleFolders().flatMap(row=>['a','b'].filter(side=>row[side==='a'?'kindA':'kindB']).map(side=>({id:row.id,side,name:folderRowName(row,side)})));}
async function findFilename(action='find'){
 const id=activeId,epoch=folderRootEpoch;let options=filenameSearchStates.get(id)||{query:'',left:true,right:true,wrap:false};let all=false,fromDialog=false;
 if(action==='find'||!options.query){
  const origin=document.activeElement,focus={...folderFocus};
  const restoreFocus=origin?.classList.contains('folder-entry')?()=>{if(id!==activeId||epoch!==folderRootEpoch||!isFolder())return;const exists=visibleFolders().some(row=>row.id===focus.path&&row[focus.side==='a'?'kindA':'kindB']);focusFolderRow(focus.side,exists?focus.path:null);}:null;
  const request=await filenameSearchDialog.open(options,restoreFocus);if(!request||id!==activeId||epoch!==folderRootEpoch||!isFolder())return;options=request.options;all=request.all;fromDialog=true;filenameSearchStates.set(id,options);}
 const context=folderActionContext(),entries=filenameSearchEntries(),matches=await runFilenameSearch(entries,options);
 if(context!==folderActionContext()||JSON.stringify(entries)!==JSON.stringify(filenameSearchEntries())){notify('Folder view changed. Search again.',true);return;}
 if(!matches.length){notify('No matching filenames in the visible tree.');return;}
 const direction=action==='previous'?-1:action==='next'?1:options.up?-1:1;
 const current=entries.findIndex(entry=>entry.id===folderFocus.path&&entry.side===folderFocus.side);
 let index=direction>0?matches.find(index=>fromDialog?index>=current:index>current):matches.findLast(index=>current<0||(fromDialog?index<=current:index<current)),wrapped=false;
 if(index===undefined&&options.wrap){index=direction>0?matches[0]:matches.at(-1);wrapped=true;}
 if(all)index=matches.includes(current)?current:matches[0];
 if(index===undefined){notify('No '+(direction>0?'next':'previous')+' filename match. Enable Wrap search to continue from the other end.');return;}
 const target=entries[index];sideSelection={a:new Set(),b:new Set()};for(const match of all?matches:[index])sideSelection[entries[match].side].add(entries[match].id);
 for(const side of ['a','b'])selectionAnchor[side]=side===target.side?target.id:entries.find(entry=>entry.side===side&&sideSelection[side].has(entry.id))?.id||null;
 focusFolderRow(target.side,target.id);document.activeElement?.scrollIntoView({block:'nearest'});
 notify(all?'Selected '+matches.length+' matching entries.':(wrapped?'Wrapped · ':'')+(matches.indexOf(index)+1)+' of '+matches.length+' filename matches');
}
const folderFilterDialog=createFolderFilterDialog();
async function editFolderFilters(){const id=activeId,values=await folderFilterDialog.open({include:$('folderInclude').value,exclude:$('folderExclude').value,query:$('folderSearch').value});if(!values||id!==activeId||!isFolder())return;$('folderInclude').value=values.include;$('folderExclude').value=values.exclude;$('folderSearch').value=values.query;folderTable();markDirty();focusFolderRow(folderFocus.side,folderFocus.path);if(!folderFocus.path)$('folderRows'+folderFocus.side.toUpperCase()).focus();}
function excludeSelectedFolders(side=folderFocus.side){
 const paths=visibleFolders().filter(row=>sideSelection[side].has(row.id)&&row[side==='a'?'kindA':'kindB']).map(row=>folderRowPath(row,side));
 if(!paths.length)return;
 $('folderExclude').value=appendExcludedPaths($('folderExclude').value,paths);folderTable();markDirty();focusFolderRow(side,folderFocus.path);
 notify('Selected entries excluded from this view. Use Reset masks to show them again.');
}
const folderTypeExclusionDialog=createFolderTypeExclusionDialog();
function selectedFileTypeMasks(side=folderFocus.side){return fileTypeMasks(visibleFolders().filter(row=>sideSelection[side].has(row.id)),side);}
function canExcludeFileTypes(side){try{return selectedFileTypeMasks(side).length>0;}catch{return false;}}
async function excludeFolderFileTypes(side=folderFocus.side){
 const masks=selectedFileTypeMasks(side),context=folderActionContext(),before=$('folderExclude').value;
 const next=appendTypeMasks(before,masks);
 if(!await folderTypeExclusionDialog.open(masks))return;
 if(context!==folderActionContext()||before!==$('folderExclude').value)throw Error('Folder view changed. Choose the file types again.');
 $('folderExclude').value=next;folderTable();markDirty();focusFolderRow(side,folderFocus.path);
 notify('File types excluded. Use Reset masks to show them again.');
}
function setFolderIgnored(ignored,side=folderFocus.side){
 const selected=folderRows.filter(row=>sideSelection[side].has(row.id));if(!selected.length)throw Error('Select entries to ignore or restore.');
 ignoredFolderRows();folderIgnoredMarks=ignored?addIgnoredRows(folderIgnoredMarks,selected):removeIgnoredRows(folderIgnoredMarks,selected);
 folderSummaryCache.reset();folderTable();folderSummary();focusFolderRow(side,folderFocus.path);
 notify(ignored?'Differences ignored in this tab. Original results and file operations are unchanged.':'Differences restored. Restoring a child also restores its containing ignored folder.');
}
function clearFolderIgnored(){folderIgnoredMarks=[];folderSummaryCache.reset();folderTable();folderSummary();}
function resetFolderMasks(){$('folderInclude').value='*';$('folderExclude').value='';$('folderSearch').value='';folderTable();markDirty();}
async function compareSelectedFolderFiles(){
 const ids=[...sideSelection[folderFocus.side]],rows=ids.map(id=>folderRows.find(row=>row.id===id));
 if(!ids.length||rows.some(row=>!row||row.alignmentConflict||(row.actualStatus||row.status)==='conflict'||[row.kindA,row.kindB].some(kind=>kind&&kind!=='file')))throw Error('Select files to compare in place.');
 stopExpansion();const context=folderActionContext(),rules={...folderRules};
 const pendingStopSerial=folderStopSerial;while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingStopSerial!==folderStopSerial){const stopped=Error('Comparison stopped.');stopped.code='ABORT_ERR';throw stopped;}
 if(context!==folderActionContext())throw Error('Folder selection changed. Choose the command again.');
 const result=await trackedFolderRead(ticket=>desktop.compareSelectedFolderFiles(ids,ticket.revision,rules,ticket));
 if(context!==folderActionContext()||JSON.stringify(rules)!==JSON.stringify(folderRules))throw Error('Folder view changed. Compare the selection again.');
 const updated=new Map(result.rows.map(row=>[row.id,row]));let metadataChanged=false;
 folderRows=folderRows.map(row=>{const fresh=updated.get(row.id);if(!fresh)return row;if(metadataKey(fresh)!==metadataKey(row))metadataChanged=true;return {...fresh,depth:row.depth};});
 if(metadataChanged)folderTable();else refreshFolderRowStatuses();folderSummary();
 notify(`Compared ${result.rows.length} selected files.`);return result.rows;
}
function quickCompareSelection(){
 const ids=[...sideSelection[folderFocus.side]];if(ids.length!==1)return null;
 const row=folderRows.find(item=>item.id===ids[0]);return row&&!row.alignmentConflict&&row.kindA==='file'&&row.kindB==='file'&&row.status!=='conflict'?row:null;
}
async function quickCompareFolderFile(){
 if(!quickCompareSelection())throw Error('Select one paired file for a quick comparison.');
 const rows=await compareSelectedFolderFiles(),row=rows[0],context=folderActionContext();
 const rule={content:'File content (SHA-256)','text-content':'Text content','text-whitespace':'Text ignoring '+folderTextIgnored('text-whitespace'),'text-case':'Text ignoring case','text-whitespace-case':'Text ignoring '+folderTextIgnored('text-whitespace-case'),size:'File size',modified:'Modified time','size-modified':'File size and modified time'}[folderRules.mode]||folderRules.mode;
 const open=await folderQuickCompare.open({left:folders.a.path+'/'+row.pathA,right:folders.b.path+'/'+row.pathB,status:row.status,rule:rule+(folderRules.mode.includes('modified')?' (tolerance '+folderRules.timeToleranceMs/1000+' seconds)':''),detail:$('folderRulesHint').textContent+(row.metadataDifferences?.length?' Differences: '+row.metadataDifferences.map(key=>folderMetadataLabels[key]||key).join(', ')+'.'+(row.contentStatus==='equal'?' File comparison matches under the current method.':''):'')});
 if(open){if(context!==folderActionContext())throw Error('Folder selection changed. Run quick comparison again.');await openFolderText(row);}
}
async function compareFolderNode(id){
 const parent=folderRows.find(row=>row.id===id);
 if(folderViewState.mode!=='tree'||!parent||!expandableFolder(parent))throw Error('Select a folder in Tree view.');
 stopExpansion();
 const context=folderActionContext();
 const pendingStopSerial=folderStopSerial;while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingStopSerial!==folderStopSerial){const stopped=Error('Comparison stopped.');stopped.code='ABORT_ERR';throw stopped;}
 if(context!==folderActionContext())throw Error('Folder selection changed. Choose the command again.');
 const result=await readFolderNode(id,true);
 if(context!==folderActionContext())throw Error('Folder selection changed. Choose the command again.');
 folderRows=mergeFolderNodeRows(folderRows,id,result);expandedFolders=new Set([...expandedFolders,id].filter(key=>folderRows.some(row=>row.id===key&&expandableFolder(row))));plan=null;folderDifferenceId=null;folderTable();folderSummary();markDirty();snapshot();
}
function mergeFolderNodeRows(existing,id,result){
 const parent=existing.find(row=>row.id===id),removed=new Set(result.removedIds||[]);
 const candidates=existing.filter(row=>row.parentId!==id&&!removed.has(row.id)).map(row=>row.id===id&&result.parentRow?{...result.parentRow,depth:row.depth}:row).concat(result.rows.map(row=>({...row,depth:(parent?.depth||0)+1})));
 const children=new Map();for(const row of candidates){if(!children.has(row.parentId))children.set(row.parentId,[]);children.get(row.parentId).push(row);}
 const rows=[],seen=new Set();function visit(parentId,depth){for(const row of children.get(parentId)||[]){if(seen.has(row.id))continue;seen.add(row.id);rows.push({...row,depth});if(expandableFolder(row))visit(row.id,depth+1);}}visit('root',0);
 return rows;
}
async function refreshSelectedFolders(){
 const selected=[...sideSelection[folderFocus.side]].map(id=>folderRows.find(row=>row.id===id));
 if(!selected.length||selected.some(row=>!row||[row.kindA,row.kindB].some(kind=>kind&&!['file','directory'].includes(kind))))throw Error('Select files or folders to refresh.');
 const nodes=selected.filter(row=>expandableFolder(row)||(row.actualStatus||row.status)==='conflict'||row.alignmentConflict).sort((a,b)=>(a.depth||0)-(b.depth||0));
 if(nodes.length&&folderViewState.mode!=='tree')throw Error('Refresh selected folders in Tree view.');
 stopExpansion();const context=folderActionContext(),rules={...folderRules};
 const current=()=>context===folderActionContext()&&JSON.stringify(rules)===JSON.stringify(folderRules);
 const pendingStopSerial=folderStopSerial;while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingStopSerial!==folderStopSerial){const stopped=Error('Comparison stopped.');stopped.code='ABORT_ERR';throw stopped;}
 if(!current())throw Error('Folder view changed. Refresh the selection again.');
 let rows=folderRows,changed=false,refreshed=0;const covered=new Set(),opened=new Set(),processed=new Set();
 function applyEntries(result){const updated=new Map(result.rows.map(row=>[row.id,row])),removed=new Set(result.removedIds||[]);rows=rows.filter(row=>!removed.has(row.id)).map(row=>updated.has(row.id)?{...updated.get(row.id),depth:row.depth}:row);changed=true;}
 try{
  for(const node of nodes){
   if(!current())throw Error('Folder view changed. Refresh the selection again.');
   if(!rows.some(row=>row.id===node.id))continue;
   const fresh=await trackedFolderRead(ticket=>desktop.refreshSelectedFolderEntries([node.id],ticket.revision,rules,ticket));
   if(!current())throw Error('Folder view changed. Refresh the selection again.');
   applyEntries(fresh);processed.add(node.id);refreshed++;
   const present=rows.find(row=>row.id===node.id);
   if(!present||!expandableFolder(present)||present.status==='conflict')continue;
   const result=await readFolderNode(node.id,true);
   if(!current())throw Error('Folder view changed. Refresh the selection again.');
   rows=mergeFolderNodeRows(rows,node.id,result);changed=true;opened.add(node.id);
   for(const row of result.rows)if(!expandableFolder(row))covered.add(row.id);
  }
  const ids=selected.filter(row=>!processed.has(row.id)&&!covered.has(row.id)&&rows.some(item=>item.id===row.id)).map(row=>row.id);
  if(ids.length){
   const result=await trackedFolderRead(ticket=>desktop.refreshSelectedFolderEntries(ids,ticket.revision,rules,ticket));
   if(!current())throw Error('Folder view changed. Refresh the selection again.');
   applyEntries(result);refreshed+=ids.length;
  }
 }finally{
  // Keep successful node refreshes visible even if a later selected entry disappeared.
  if(changed&&current()){
   folderRows=rows;expandedFolders=new Set([...expandedFolders,...opened].filter(id=>rows.some(row=>row.id===id&&expandableFolder(row))));
   plan=null;folderDifferenceId=null;folderTable();folderSummary();markDirty();snapshot();
  }
 }
 notify(`Refreshed ${refreshed} selected files or folder nodes.`);
}

async function toggleFolder(path){
 if(['recursive','filename'].includes(folderViewState.mode))return;
 if(folderRows.find(row=>row.id===path)?.alignmentConflict)throw Error('This aligned entry changed type. Clear its alignment before expanding.');
 stopExpansion();const opening=!expandedFolders.has(path);
 if(opening)expandedFolders.add(path);else expandedFolders.delete(path);
 await scan(false,true,opening?path:null);
}
async function readFolderTree(autoExpandFrom=null){
 const rows=[],expandedPaths=folderRows.filter(row=>expandedFolders.has(row.id)).map(row=>({a:row.pathA,b:row.pathB}));let skipped=0,chainNodes=0,chainLimited=false;const visited=new Set();
 async function visit(id,depth,followSingle=false){
  if(visited.has(id))return;visited.add(id);
  const data=await readFolderNode(id,false,id==='root');skipped+=data.skipped||0;
  const child=data.rows.length===1?data.rows[0]:null;
  const chain=(followSingle||id===autoExpandFrom)&&!data.skipped&&child&&expandableFolder(child)&&[child.kindA,child.kindB].every(kind=>!kind||kind==='directory');
  let next=null;
  if(chain){if(chainNodes<256){chainNodes++;next=child.id;expandedFolders.add(next);}else chainLimited=true;}
  for(const row of data.rows){rows.push({...row,depth});if(expandableFolder(row)&&(expandedFolders.has(row.id)||expandedPaths.some(paths=>paths.a&&paths.a===row.pathA||paths.b&&paths.b===row.pathB))){expandedFolders.add(row.id);await visit(row.id,depth+1,row.id===next);}}
 }
 await visit('root',0);
 if(chainLimited)notify('Automatic expansion stopped after 256 folders. Expand the last folder to continue.');
 return {rows,skipped};
}
let folderFocus={side:'a',path:null},selectionAnchor={a:null,b:null};
let folderTypeAhead={text:'',time:0,context:'',path:null};
function canCopyFolderSelection(side){
 const ids=sideSelection[side],other=side==='a'?'b':'a';if(disconnectedFolders()||!desktop||!ids.size||!folders[other])return false;
 if(!folders.a?.remote&&!folders.b?.remote)return true;
 if(!desktop.cancelFolderTransfer||ids.size>1000)return false;
 return [...ids].every(id=>{const row=folderRows.find(item=>item.id===id);const kind=row?.[side==='a'?'kindA':'kindB'],otherKind=row?.[side==='a'?'kindB':'kindA'];return row&&['file','directory'].includes(kind)&&[null,undefined,kind].includes(otherKind)&&!row.alignmentConflict;});
}
function canDeleteFolderSelection(side){
 const ids=sideSelection[side];if(disconnectedFolders()||!desktop||!ids.size)return false;
 if(!folders.a?.remote&&!folders.b?.remote)return true;
 if(!folders[side]?.remote||!desktop.cancelFolderTransfer||ids.size!==1)return false;
 const row=folderRows.find(item=>ids.has(item.id));return row?.[side==='a'?'kindA':'kindB']==='file'&&!row.alignmentConflict;
}
async function cancelActiveFolderTransfer(){
 const task=folderTransferTask;if(!task||task.stopping)return;task.stopping=true;
 $('cancelPlan').textContent='Stopping…';$('cancelPlan').disabled=true;
 try{await desktop.cancelFolderTransfer(task.sessionId,task.planId||undefined,task.requestId);}catch(error){task.stopping=false;notify(error.message,true);$('cancelPlan').disabled=false;$('cancelPlan').textContent='Stop';}
}
function syncFolderSelection(){
 selection=new Set([...sideSelection.a,...sideSelection.b]);
 for(const side of ['a','b']){
  const container=$('folderRows'+side.toUpperCase()),entries=[...container.children],existing=entries.filter(el=>!el.classList.contains('missing'));
  const target=(folderFocus.side===side?existing.find(el=>el.dataset.id===folderFocus.path):null)||existing.find(el=>sideSelection[side].has(el.dataset.id))||existing[0];
  const containerTabIndex=target?-1:0;if(container.tabIndex!==containerTabIndex)container.tabIndex=containerTabIndex;
  for(const el of entries){const selected=sideSelection[side].has(el.dataset.id),ariaSelected=String(selected),tabIndex=el===target?0:-1;if(el.classList.contains('selected')!==selected)el.classList.toggle('selected',selected);if(el.getAttribute('aria-selected')!==ariaSelected)el.setAttribute('aria-selected',ariaSelected);if(el.getAttribute('tabindex')!==String(tabIndex))el.tabIndex=tabIndex;}
 }
 for(const side of ['a','b']){$('copy'+side.toUpperCase()).disabled=operation||!canCopyFolderSelection(side);$('delete'+side.toUpperCase()).disabled=operation||!canDeleteFolderSelection(side);}
 updateSelected();
}
function focusFolderRow(side,path){
 folderFocus={side,path};syncFolderSelection();
 const container=$('folderRows'+side.toUpperCase());([...container.children].find(el=>el.dataset.id===path)||container).focus({preventScroll:true});
}
function selectFolderRow(side,row,event={}){
 const key=side==='a'?'kindA':'kindB';if(!row[key])return;
 const rows=visibleFolders().filter(item=>item[key]),toggle=event.ctrlKey||event.metaKey;
 if(event.shiftKey&&selectionAnchor[side]){
  const found=rows.findIndex(item=>item.id===selectionAnchor[side]),end=rows.findIndex(item=>item.id===row.id),start=found<0?end:found;
  if(found<0)selectionAnchor[side]=row.id;
  if(!toggle)sideSelection={a:new Set(),b:new Set()};
  for(const item of rows.slice(Math.max(0,Math.min(start,end)),Math.max(start,end)+1))sideSelection[side].add(item.id);
 }else{
  if(!toggle)sideSelection={a:new Set(),b:new Set()};
  if(toggle&&sideSelection[side].has(row.id))sideSelection[side].delete(row.id);else sideSelection[side].add(row.id);
  selectionAnchor[side]=row.id;
 }
 focusFolderRow(side,row.id);
}
function selectAllFolders(side){sideSelection={a:new Set(),b:new Set()};sideSelection[side]=new Set(visibleFolders().filter(row=>row[side==='a'?'kindA':'kindB']).map(row=>row.id));syncFolderSelection();}
function clearFolderSelection(){sideSelection={a:new Set(),b:new Set()};syncFolderSelection();}
let folderContextMenu;
function closeFolderContext(){folderContextMenu?.close();}
function entryName(title,value=''){return new Promise(resolve=>{const dialog=$('entryNameDialog');$('entryNameTitle').textContent=title;$('entryName').value=value;dialog.returnValue='';dialog.onclose=()=>resolve(dialog.returnValue==='save'?$('entryName').value:null);dialog.showModal();$('entryName').focus();$('entryName').select();});}
function remapRenamedTabs(updates=[]){
 let activeFilenameChanged=false;
 for(const update of updates){const tab=tabs.get(update.id);if(!tab?.data)continue;let changed=false;
  for(const side of ['a','b']){if(update.files?.[side]){tab.data.files[side]={...update.files[side]};if(update.id===activeId){files[side]={...update.files[side]};activeFilenameChanged=true;}changed=true;}if(update.folders?.[side]){tab.data.folders[side]={...update.folders[side]};if(tab.runtimeFolders)tab.runtimeFolders[side]={...update.folders[side]};if(update.id===activeId)folders[side]={...update.folders[side]};changed=true;}}
  if(update.entries?.length){
   const remapPair=pair=>{const next={...pair};for(const entry of update.entries){const value=next[entry.side];if(value===entry.oldPath||value?.startsWith(entry.oldPath+'/'))next[entry.side]=entry.newPath+value.slice(entry.oldPath.length);}return next;};
   tab.folderAlignmentPairs=(tab.folderAlignmentPairs||[]).map(remapPair);if(tab.data.options.folderAlignment)tab.data.options.folderAlignment=tab.data.options.folderAlignment.map(remapPair);
   if(update.id===activeId)folderAlignmentPairs=folderAlignmentPairs.map(remapPair);changed=true;
  }
  if(update.id!==activeId&&(update.entries?.length||changed)){tab.folderRows=[];tab.folderTreeRevision=null;tab.expandedFolders=new Set();tab.sideSelection={a:new Set(),b:new Set()};tab.selectionAnchor={a:null,b:null};tab.folderFocus={side:'a',path:null};tab.folderIgnoredMarks=[];}
  if(changed){tab.dirty=true;if(update.id===activeId)markDirty();}
 }
 metadata();renderTabs();
 if(activeFilenameChanged&&!isFolder()&&!isAdvanced()&&$('textProfile').value==='auto'){invalidate();compute(true,false);}
}
// Apply every native rename notification after the current renderer operation.
// Updating descriptors in place keeps unsaved text and editor undo state intact.
let externalRemapQueue=Promise.resolve();
if(desktop?.onContextsRemapped)desktop.onContextsRemapped(updates=>{
 externalRemapQueue=externalRemapQueue.catch(()=>{}).then(async()=>{
  while(operation)await new Promise(resolve=>idleWaiters.push(resolve));
  return run(async()=>{
   snapshot();remapRenamedTabs(updates);
   if(!updates.some(update=>update.id===activeId))return;
   plan=null;folderRootEpoch++;folderTreeRevision=null;stopExpansion();
   if(isFolder()){folderRows=[];folderIgnoredMarks=[];expandedFolders.clear();sideSelection={a:new Set(),b:new Set()};selection.clear();selectionAnchor={a:null,b:null};folderFocus={side:'a',path:null};folderTable();await refreshFolderNavigation();await scan();}
   snapshot();
  });
 });
});

async function loggedFolderChange(description,operations,action){
 const captured=folderOperationHistory.capture($('sessionName').value,description+'\nLeft: '+(folders.a?.path||'Not selected')+'\nRight: '+(folders.b?.path||'Not selected'),{operations});
 try{const outcome=await action();folderOperationHistory.record(captured,{completed:outcome?.changed??1});return outcome;}catch(error){folderOperationHistory.record(captured,null,error);folderRootEpoch++;folderTreeRevision=null;try{await scan();}catch(refreshError){throw Error(error.message+' Refresh failed: '+refreshError.message);}throw error;}
}
async function renameEntry(side,row){
 if(disconnectedFolders())throw Error('Reconnect saved remote folders before renaming.');
 if(folders[side]?.remote&&(row?.[side==='a'?'kindA':'kindB']!=='file'||!desktop.previewFolderTreeRename))throw Error('Select one regular remote file to rename.');
 const kind=row?.[side==='a'?'kindA':'kindB'];if(!['file','directory'].includes(kind)||sideSelection[side].size!==1||!sideSelection[side].has(row.id))throw Error('Select one file or folder to rename.');
 const value=await entryName(kind==='directory'?'Rename folder':'Rename file',folderRowName(row,side));if(value===null||value===folderRowName(row,side))return;
 if(folders[side]?.remote)return previewRemoteRename(side,row,value);
 stopExpansion();const sourcePath=folderRowPath(row,side),targetPath=[sourcePath.includes('/')?sourcePath.slice(0,sourcePath.lastIndexOf('/')):'',value].filter(Boolean).join('/');const outcome=await loggedFolderChange('Rename '+kind+' on '+(side==='a'?'left':'right'),[{action:'rename',sourcePath,targetPath}],()=>desktop.renameFolderTreeEntry(side,row.id,value,folderTreeRevision));remapRenamedTabs(outcome.remappedContexts);folderRootEpoch++;folderTreeRevision=null;
 const oldPath=folderRowPath(row,side),pathKey=side==='a'?'pathA':'pathB';if(kind==='directory')folderRows=folderRows.map(item=>({...item,[pathKey]:item[pathKey]===oldPath||item[pathKey]?.startsWith(oldPath+'/')?outcome.path+item[pathKey].slice(oldPath.length):item[pathKey]}));
 sideSelection={a:new Set(),b:new Set()};selectionAnchor={a:null,b:null};await scan();const renamed=folderRows.find(item=>folderRowPath(item,side)===outcome.path);if(renamed)selectFolderRow(side,renamed);markDirty();snapshot();
}
async function previewRemoteRename(side,row,name){
 stopExpansion();const context=folderActionContext(),serial=folderStopSerial;
 while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));
 if(serial!==folderStopSerial||context!==folderActionContext())throw Error('The folder selection changed. Choose Rename again.');
 const task={sessionId:activeId,planId:null,requestId:crypto.randomUUID(),phase:'preview'};folderTransferTask=task;expansionControls();
 try{const preview=await desktop.previewFolderTreeRename(side,row.id,name,folderTreeRevision,task.requestId);
  if(!preview||preview.cancelled)return;
  if(task.stopping||serial!==folderStopSerial||context!==folderActionContext()){await desktop.cancelFolderTransfer(task.sessionId,preview.id,task.requestId);return;}
  plan=preview;displayPlan('Rename remote file on the '+(side==='a'?'left':'right')+' side.\nFolder: '+preview.source+'\nThe destination must not already exist. Review the name below before continuing.');
 }finally{if(folderTransferTask===task)folderTransferTask=null;$('cancelPlan').disabled=false;$('cancelPlan').textContent='Cancel';expansionControls();}
}
async function createFolderEntry(kind,side,row){const parentOf=!!row&&row[side==='a'?'kindA':'kindB']==='file',parent=row?.id||'root';const value=await entryName(kind==='directory'?'New folder':'New file');if(value===null)return;const sourcePath=row?folderRowPath(row,side):'',parentPath=parentOf?(sourcePath.includes('/')?sourcePath.slice(0,sourcePath.lastIndexOf('/')):''):sourcePath,targetPath=[parentPath,value].filter(Boolean).join('/');const outcome=await loggedFolderChange('Create '+(kind==='directory'?'folder':'file')+' on '+(side==='a'?'left':'right'),[{action:'create '+kind,path:targetPath}],()=>desktop.createFolderTreeEntry(kind,side,parent,value,folderTreeRevision,parentOf));if(parent!=='root'&&!parentOf)expandedFolders.add(parent);await scan();const created=folderRows.find(item=>folderRowPath(item,side)===outcome.path);if(created)selectFolderRow(side,created);}
async function newFolder(side,row){return createFolderEntry('directory',side,row);}
async function newFile(side,row){return createFolderEntry('file',side,row);}

function focusedFolder(){return folderRows.find(row=>row.id===folderFocus.path);}
function selectedFolderPair(){
 if(sideSelection.a.size!==1||sideSelection.b.size!==1)return null;
 const left=[...sideSelection.a][0],right=[...sideSelection.b][0],a=folderRows.find(row=>row.id===left),b=folderRows.find(row=>row.id===right);
 if(!a||!b||!['file','directory'].includes(a.kindA)||a.kindA!==b.kindB)return null;
 return {left,right};
}
async function alignSelectedFolders(){
 const pair=selectedFolderPair();if(!pair)throw Error('Select one matching file or folder type on each side using Ctrl/Command.');
 stopExpansion();const response=await desktop.alignFolderRows(pair.left,pair.right,folderTreeRevision);folderRootEpoch++;folderTreeRevision=response.revision;folderAlignmentPairs=response.pairs||[];folderIgnoredMarks=[];sideSelection={a:new Set(),b:new Set()};selectionAnchor={a:null,b:null};plan=null;await scan();markDirty();snapshot();notify('Selected entries are aligned in this folder tree.');
}
async function clearAlignedFolders(){stopExpansion();const response=await desktop.clearFolderAlignment(folderTreeRevision);folderRootEpoch++;folderTreeRevision=response.revision;folderAlignmentPairs=response.pairs||[];folderIgnoredMarks=[];sideSelection={a:new Set(),b:new Set()};selectionAnchor={a:null,b:null};plan=null;await scan();markDirty();snapshot();}
async function compareSelectedPair(){
 const pair=selectedFolderPair();if(!pair)throw Error('Select one file on each side, or one folder on each side, using Ctrl/Command.');
 stopExpansion();const origin=activeId,rules={...folderRules},out=await openTrackedFolderFile(ticket=>desktop.openFolderTreePair(pair.left,pair.right,folderTreeRevision,folderEncodings(rules),ticket));
 if(out.mode!=='text-compare'&&out.mode!=='folder-compare')return openDataComparison(out,origin,out.id,out.mode);
 await newSession(out.mode,out.id);parentTabId=origin;
 if(out.mode==='folder-compare'){folders=out.folders;folderRules=rules;metadata();await refreshFolderNavigation();await scan();}
 else{for(const side of ['a','b'])setLoaded(side,out[side]);inheritFolderTextRules(rules);compute();}
 $('sessionName').value=out.name.slice(0,200);markDirty();snapshot();if(out.remote)notify(out.mode==='folder-compare'?'Opened the selected folders in a comparison tab.':'Opened remote files. Use Save to server when available, or Save as for a local copy.');
}

async function changeFolderModified(side){
 const paths=[...sideSelection[side]],key=side==='a'?'kindA':'kindB';
 const entries=paths.map(path=>{const row=folderRows.find(row=>row.id===path);if(!row||!['file','directory'].includes(row[key]))throw Error('Select regular files or folders to change their modified time.');return {path:folderRowPath(row,side),modified:row[side==='a'?'mtimeA':'mtimeB']};});
 if(!entries.length||entries.length>1000)throw Error('Select between 1 and 1000 files or folders.');
 stopExpansion();const context=folderActionContext();
 const result=await folderModifiedDialog.open({side,entries,onApply:modified=>{if(context!==folderActionContext())throw Error('Folder selection changed. Cancel and choose the command again.');return loggedFolderChange('Change modified time on '+(side==='a'?'left':'right')+' to '+new Date(modified).toISOString(),entries.map(entry=>({action:'modified time',path:entry.path})),()=>desktop.setFolderTreeModified(side,paths,modified,folderTreeRevision));}});
 if(!result)return;await scan();markDirty();notify(`Changed modified time for ${result.changed} ${result.changed===1?'entry':'entries'}.`);
}
async function showFolderProperties(side){
 const ids=[...sideSelection[side]];
 if(!ids.length||ids.length>1000)throw Error('Select between 1 and 1000 files or folders.');
 stopExpansion();const context=folderActionContext();
 const result=await (folders.a?.remote||folders.b?.remote?trackedFolderRead(ticket=>desktop.getFolderTreeProperties(side,ids,folderTreeRevision,ticket)):desktop.getFolderTreeProperties(side,ids,folderTreeRevision));
 if(context!==folderActionContext())throw Error('Folder selection changed. Choose Properties again.');
 focusFolderRow(side,folderFocus.path||ids[0]);
 const token=folderTreeRevision;await folderPropertiesDialog.open(result,result.canCalculateSize===false?null:entry=>{const index=result.entries.indexOf(entry);if(index<0||context!==folderActionContext())throw Error('Folder selection changed. Open Properties again.');return desktop.getFolderTreeSize(side,ids[index],token,result.sizeRequestToken);},result.canCalculateSize===false?null:()=>desktop.cancelFolderSize(result.sizeRequestToken));
}
async function openTextExternally(side){if(!desktop)return;if(isFolder())return openFolderExternally(side);if(isAdvanced()){const input=currentEditor().getState().inputs[side];if(!input?.diskToken)throw Error('Open this input from disk first. Saved sessions and archive entries contain embedded data.');await desktop.openExternalEditor({source:'advanced',side,token:input.diskToken});notify('Opened the saved disk file. Your current edits stay in this tab; reopen the input to read external changes.');return;}if(!files[side].path)throw Error('Open a file from disk first.');await desktop.openExternalEditor({source:'text',side});notify(localEdits[side]?'Opened the saved file. Unsaved text stays in this tab.':'Opened file in your external application.');}
async function openFolderExternally(side){const paths=[...sideSelection[side]],row=folderRows.find(item=>item.id===paths[0]);if(paths.length!==1||row?.[side==='a'?'kindA':'kindB']!=='file')throw Error('Select one file to open externally.');await desktop.openExternalEditor({source:'folder-tree',side,id:row.id,revision:folderTreeRevision});notify('Opened file in your external application.');}
const folderComparisonTypes=[['text-compare','text'],['binary-compare','binary'],['table-compare','table'],['picture-compare','picture'],['audio-compare','audio'],['archive-compare','archive'],['registry-compare','registry']];
async function folderCommand(action){if(action==='apply-patch'){if(!isFolder())throw Error('Open a folder comparison first.');return folderPatchDialog.open(folderFocus.side);}if(!isFolder()||!activeId)return;if(['view-tree','view-flat','view-recursive','view-filename'].includes(action))return setFolderView(action.slice(5));if(action.startsWith('rules-'))return setFolderRules(action.slice(6));if(['update-both','update-left','update-right'].includes(action))return previewUpdateBoth(action==='update-left'?'b-to-a':action==='update-right'?'a-to-b':'both');if(['mirror-left','mirror-right'].includes(action))return previewMirror(action==='mirror-left'?'b-to-a':'a-to-b');if(action==='refresh-selected')return refreshSelectedFolders();if(action==='compare-node')return compareFolderNode(focusedFolder()?.id);if(action==='compare-selected')return compareSelectedFolderFiles();if(action==='quick-compare')return quickCompareFolderFile();if(action==='report')return folderReport.open();if(action==='report-selected')return reportSelectedFolders();if(action==='text-report')return reportFolderTextFiles();if(action==='compare-pair')return compareSelectedPair();if(action==='align-pair')return alignSelectedFolders();if(action==='clear-alignment')return clearAlignedFolders();if(action==='sort-reverse'){folderViewState.descending=!folderViewState.descending;folderTable();return markDirty();}if(action.startsWith('sort-'))return setFolderSort(action.slice(5));if(action==='stop')return stopExpansion('Comparison stopped',true);if(action==='expand-all')return startExpansion();if(action==='expand-subtree')return startExpansion(focusedFolder()?.id||'root');if(action==='collapse-subtree')return collapseSubtree(focusedFolder()?.id||'root');if(action==='columns-reset')return folderColumns.reset();if(action==='find-name')return findFilename();if(action==='find-next-name')return findFilename('next');if(action==='find-previous-name')return findFilename('previous');if(action==='suppress-filters')return toggleFolderFilters();if(action==='operation-history')return folderOperationHistory.open();if(action==='toggle-legend')return toggleFolderLegend();if(action==='always-show-folders')return toggleAlwaysShowFolders();if(action==='options')return compactFolderLayout.open();if(action==='filters')return editFolderFilters();if(action==='name-options')return openFolderNameOptions();if(action==='auto-refresh')return openFolderAutoRefreshOptions();if(action==='metadata-options')return openFolderMetadataOptions();if(action==='timestamp-options')return openFolderTimestampOptions();if(action==='text-encoding')return editFolderEncoding();if(action==='tolerance')return editFolderTolerance();if(action==='reset-masks')return resetFolderMasks();if(action==='exclude-selected')return excludeSelectedFolders();if(action==='exclude-types')return excludeFolderFileTypes();if(action==='ignore-selected')return setFolderIgnored(true);if(action==='restore-selected')return setFolderIgnored(false);if(action==='restore-all')return clearFolderIgnored();if(action.startsWith('select-')&&action!=='select-all')return applySelectionRule(action.slice(7));const side=folderFocus.side,row=focusedFolder();if(action==='navigate-parents')return navigateFolderParents();if(action.startsWith('navigate-'))return navigateFolder(side,action.slice(9));if(action.startsWith('open-as-')){const mode=action.slice(8);if(!folderComparisonTypes.some(([value])=>value===mode))throw Error('Unsupported comparison type.');if(!row||row[side==='a'?'kindA':'kindB']!=='file'||sideSelection[side].size!==1||!sideSelection[side].has(row.id))throw Error('Select one file to compare.');return openFolderText(row,mode);}if(action==='external-editor')return openFolderExternally(side);if(action==='attributes'){stopExpansion();return folderAttributesDialog.open(side);}if(action==='modified-time')return changeFolderModified(side);if(action==='properties')return showFolderProperties(side);if(action==='copy-to-folder')return copyToFolder(side);if(action==='move-to-folder')return moveToFolder(side);if(action==='move-right'||action==='move-left')return folderAction('move',action==='move-right'?'a':'b');if(action==='select-all')return selectAllFolders(side);if(action==='clear-selection')return clearFolderSelection();if(action==='refresh')return scan();if(action==='collapse-all')return collapseSubtree();if(action==='new-folder')return newFolder(side,row);if(action==='new-file')return newFile(side,row);if(['open','reveal'].includes(action)&&(!row||!row[side==='a'?'kindA':'kindB']||sideSelection[side].size!==1||!sideSelection[side].has(row.id)))throw Error('Select one file or folder for this action.');if(action==='delete')return folderAction('delete',side);if(['copy-paths','copy-relative-paths','copy-names'].includes(action))return desktop.copyFolderTreePaths(side,[...sideSelection[side]],folderTreeRevision,action==='copy-names'?'name':action==='copy-relative-paths'?'relative':'absolute');if(!row)return;if(action==='open')return row[side==='a'?'kindA':'kindB']==='directory'?toggleFolder(row.id):openFolderText(row);if(action==='rename')return renameEntry(side,row);if(action==='reveal')return desktop.revealFolderTreeEntry(side,row.id,folderTreeRevision);if(action==='expand'&&!expandedFolders.has(row.id))return toggleFolder(row.id);if(action==='collapse'&&expandedFolders.has(row.id))return toggleFolder(row.id);}
function folderActionContext(){return JSON.stringify({id:activeId,epoch:folderRootEpoch,revision:folderTreeRevision,syncMode:$('folderSyncMode').value,direction:$('folderDirection').value,roots:[folders.a?.path,folders.b?.path],focus:folderFocus,selected:[...sideSelection.a].sort(),other:[...sideSelection.b].sort()});}
async function runFolderWhenIdle(action){const context=folderActionContext();return runWhenIdle(()=>{if(!isFolder()||context!==folderActionContext()){notify('Folder selection changed. Choose the command again.',true);return;}return action();});}
function folderContext(side,row,x,y){
 const blank=!row;if(blank){folderFocus={side,path:null};syncFolderSelection();}else{folderFocus={side,path:row.id};syncFolderSelection();}row=row||{id:'root',parentId:null,nameA:'',nameB:'',kindA:'directory',kindB:'directory'};
 if(!blank&&!sideSelection[side].has(row.id))selectFolderRow(side,row);
 const menuContext=folderActionContext();
 const remote=!!(folders.a?.remote||folders.b?.remote),capabilities={read:true,local:!remote};
 const entries=[];let target=entries,requiredCapability='read';
 const selected=visibleFolders().filter(item=>sideSelection[side].has(item.id)),key=side==='a'?'kindA':'kindB';
 const add=(label,action,disabled=false,immediate=false,dispatch=false,capability=requiredCapability)=>{const unavailable=!capabilities[capability];target.push({label,title:unavailable?'Not available for remote folders yet':undefined,disabled:disabled||unavailable,validate:()=>{if(immediate||menuContext===folderActionContext())return true;notify('Folder selection changed. Open the menu again.',true);return false;},action:()=>immediate||dispatch?action():runFolderWhenIdle(action)});};
 const local=(label,action,disabled=false,immediate=false,dispatch=false)=>add(label,action,disabled,immediate,dispatch,'local');
 const separator=()=>target.push({separator:true});
 const group=(label,build,capability=requiredCapability)=>{const previous=target,previousCapability=requiredCapability,children=[];target=children;requiredCapability=capability;build();target=previous;requiredCapability=previousCapability;const unavailable=!capabilities[capability];target.push({label,title:unavailable?'Not available for remote folders yet':undefined,children,disabled:unavailable});};
 add('Open comparison',async()=>{for(const item of selected){if(item[key]==='file'){await openFolderText(item);break;}}},selected.length!==1||row[key]!=='file'||(row.actualStatus||row.status)==='conflict');
 add('Compare selected files',compareSelectedFolderFiles,!selected.length||selected.some(item=>item.alignmentConflict||(item.actualStatus||item.status)==='conflict'||[item.kindA,item.kindB].some(kind=>kind&&kind!=='file')));
 group('Open as',()=>{for(const [mode,label]of folderComparisonTypes)add('Open as '+label+' comparison',()=>openFolderText(selected[0],mode),selected.length!==1||selected[0]?.[key]!=='file'||selected[0]?.status==='conflict');});
 local('Open in external editor…',()=>openFolderExternally(side),selected.length!==1||row[key]!=='file');
 separator();
 add(side==='a'?'Copy to right':'Copy to left',()=>folderAction('copy',side),!canCopyFolderSelection(side));
 group('Transfer to folder',()=>{add('Copy to folder…',()=>copyToFolder(side),!selected.length||selected.length>1000);add('Move to folder…',()=>moveToFolder(side),!selected.length||selected.length>1000);},'local');
 local(side==='a'?'Move left → right…':'Move right → left…',()=>folderAction('move',side),!folders[side==='a'?'b':'a']||!selected.length||selected.length>1000);
 add('Delete selected',()=>folderAction('delete',side),!canDeleteFolderSelection(side));
 group('Synchronize',()=>{for(const [label,direction]of [['Update left…','b-to-a'],['Update right…','a-to-b'],['Update both sides…','both']])add(label,()=>previewUpdateBoth(direction),!selection.size||!folders.a||!folders.b);separator();for(const [label,direction]of [['Mirror to left…','b-to-a'],['Mirror to right…','a-to-b']])add(label,()=>previewMirror(direction),!selection.size||!folders.a||!folders.b);if(type==='folder-sync'){separator();group('Sync method',()=>{for(const [value,label]of [['mirror','Mirror folders'],['update','Update newer files'],['update-both','Update both sides']])add(label,()=>{$('folderSyncMode').value=value;refreshSyncControls();markDirty();},$('folderSyncMode').value===value);});}},'local');
 group('File-action scope',()=>{add('Use current filters',()=>setFolderOperationScope('filtered'),$('folderOperationScope').value==='filtered');add('Include all contents',()=>setFolderOperationScope('all'),$('folderOperationScope').value==='all');});
 add(row[key]==='directory'?'Rename folder…':'Rename file…',()=>renameEntry(side,row),blank||selected.length!==1||!['file','directory'].includes(row[key])||disconnectedFolders()||(folders[side]?.remote&&(row[key]!=='file'||!desktop.previewFolderTreeRename)));
 group('New',()=>{add('New folder…',()=>newFolder(side,row));add('New file…',()=>newFile(side,row));},'local');
 group('Properties',()=>{
  add('View properties…',()=>showFolderProperties(side),!selected.length||selected.length>1000||selected.some(item=>!['file','directory'].includes(item[key])));
  local('Change attributes…',()=>{stopExpansion();return folderAttributesDialog.open(side);},!selected.length||selected.length>1000||selected.some(item=>!['file','directory'].includes(item[key])));
  local('Change modified time…',()=>changeFolderModified(side),!selected.length||selected.length>1000||selected.some(item=>!['file','directory'].includes(item[key])));
  local('Reveal in file manager',()=>desktop.revealFolderTreeEntry(side,row.id,folderTreeRevision),blank||selected.length!==1);
  for(const [label,format]of [['Copy paths','absolute'],['Copy relative paths','relative'],['Copy filenames','name']])add(label,()=>desktop.copyFolderTreePaths(side,selected.map(item=>item.id),folderTreeRevision,format),!selected.length);
 });
 separator();
 group('Tree',()=>{
  if(!blank&&row[key]==='directory'){add('Compare this folder',()=>compareFolderNode(row.id),folderViewState.mode!=='tree'||row.alignmentConflict);add(expandedFolders.has(row.id)?'Collapse folder':'Expand folder',()=>toggleFolder(row.id),row.alignmentConflict);add('Expand subtree',()=>startExpansion(row.id),row.alignmentConflict);add('Collapse subtree',()=>collapseSubtree(row.id));}
  add('Expand all',()=>startExpansion(),Boolean(expansionTask)||['recursive','filename'].includes(folderViewState.mode));
  add('Collapse all',()=>collapseSubtree(),!expandedFolders.size||['recursive','filename'].includes(folderViewState.mode));
  add('Stop expanding',()=>stopExpansion('Comparison stopped',true),$('folderStop').disabled,true);
 });
 group('Selection',()=>{add('Select all',()=>selectAllFolders(side));for(const [rule,label]of [['files','Select files'],['files-both','Select files on both sides'],['newer-both','Select newer on both sides'],['one-sided-both','Select one-sided on both sides'],['invert','Invert selection'],['changed','Select changed'],['matching','Select matching files'],['left-only','Select left only'],['right-only','Select right only'],['newer-left','Select newer left'],['newer-right','Select newer right']])add(label,()=>applySelectionRule(rule,side));add('Clear selection',clearFolderSelection);});
 group('View',()=>{add('Filters & options…',()=>compactFolderLayout.open());separator();for(const [mode,label]of [['tree','Show folder tree'],['flat','Show loaded files'],['recursive','Show all files recursively'],['filename','Match filenames across folders']])add(label,()=>setFolderView(mode),folderViewState.mode===mode);separator();for(const [value,label]of [['all','Show all'],['diff','Show differences'],['context','Show differences with parents'],...FOLDER_FILTERS.map(([value,label])=>[value,'Show '+label]),['same',isFolderTextRule(folderRules.mode)?'Show text matches':folderRules.mode==='content'?'Show identical':'Show metadata matches']])add(label,()=>setFilter(value));add('Exclude selected',()=>excludeSelectedFolders(side),!selected.length);add('Exclude file types…',()=>excludeFolderFileTypes(side),!canExcludeFileTypes(side));add(folderViewState.alwaysShowFolders?'Use normal folder visibility':'Always show folders',toggleAlwaysShowFolders,folderViewState.mode!=='tree');add(folderSuppressedTabs.has(activeId)?'Restore filters':'Show hidden entries',toggleFolderFilters);add('Edit filename filters…',editFolderFilters);add('Reset masks',resetFolderMasks);separator();add('Automatic refresh…',openFolderAutoRefreshOptions);add('Reset column widths',()=>folderColumns.reset());add(folderViewState.hideLegend?'Show color legend':'Hide color legend',toggleFolderLegend);add('Display preferences…',()=>displaySettings.open());});
 group('Sort',()=>{for(const [value,label]of [['name','Sort by name'],['path','Sort by path'],['size-left','Sort by left size'],['size-right','Sort by right size'],['modified-left','Sort by left last modified'],['modified-right','Sort by right last modified']])add(label,()=>setFolderSort(value));add('Reverse sort',()=>{folderViewState.descending=!folderViewState.descending;folderTable();markDirty();});});
 group('Compare',()=>{add('Ignore selected differences',()=>setFolderIgnored(true,side),!selected.length);add('Restore selected differences',()=>setFolderIgnored(false,side),!selected.some(item=>item.ignored));add('Restore all ignored differences',clearFolderIgnored,!folderIgnoredMarks.length);separator();add('Quick comparison…',quickCompareFolderFile,!quickCompareSelection());add('Refresh selected',refreshSelectedFolders,!selected.length||selected.some(item=>[item.kindA,item.kindB].some(kind=>kind&&!['file','directory'].includes(kind))));add('Compare selected pair',compareSelectedPair,!selectedFolderPair());add('Align selected pair',alignSelectedFolders,!selectedFolderPair());add('Clear alignment',clearAlignedFolders,!folderAlignmentPairs.length);add('Filename matching…',openFolderNameOptions);separator();for(const [mode,label]of [['content','Compare by content'],['text-content','Compare text preserving case and spaces'],['text-whitespace','Compare text ignoring whitespace'],['text-case','Compare text ignoring case'],['text-whitespace-case','Compare text ignoring case and whitespace'],['size','Compare by size'],['modified','Compare by modified time'],['size-modified','Compare by size and modified time']])add(label,()=>setFolderRules(mode),folderRules.mode===mode);add('Metadata options…',openFolderMetadataOptions);add('Text encoding…',editFolderEncoding);add('Ignored text…',()=>editIgnoredText(true));add('Timestamp tolerance…',editFolderTolerance);add('Timestamp options…',openFolderTimestampOptions);separator();add('Compare / Refresh',scan);add('Swap left and right',swap);});
 group('Navigate',()=>{add('Back to parent comparison',backToFolder,!parentTabId||!tabs.has(parentTabId));local('Compare parent folders',compareParentFolders,!folders.a||!folders.b);separator();add('Find filename…',()=>findFilename());add('Next filename match',()=>findFilename('next'));add('Previous filename match',()=>findFilename('previous'));separator();add('Choose left folder…',()=>openSide('a'));add('Choose right folder…',()=>openSide('b'));if(desktop){add(folders.a?.remote?'Reconnect left remote folder…':'Connect left remote folder…',()=>{ $('folderRemoteA')?.click(); },false,false,true);add(folders.b?.remote?'Reconnect right remote folder…':'Connect right remote folder…',()=>{ $('folderRemoteB')?.click(); },false,false,true);}for(const [targetSide,label]of [['a','Recent left folders'],['b','Recent right folders']])group(label,()=>{const history=folderNavigationState[targetSide]?.history||[];if(!history.length)add('No recent folders',()=>{},true);for(const path of history)add(path,()=>navigateFolder(targetSide,'path',path),path===folders[targetSide]?.path);});separator();const noChanges=filter==='same'||!visibleFolders().some(item=>['left','right','different','changed','conflict'].includes(item.status));add('Previous difference',()=>jump(-1),noChanges);add('Next difference',()=>jump(1),noChanges);separator();for(const [action,label,key]of [['back','Back to previous folder','canBack'],['forward','Forward to next folder','canForward'],['parent','Go to parent folder','canParent']])add(label,()=>navigateFolder(side,action),!folderNavigationState[side]?.[key]);local('Go to both parent folders',navigateFolderParents,!folderNavigationState.a?.canParent&&!folderNavigationState.b?.canParent);});
 group('Reports',()=>{add('File action history…',()=>folderOperationHistory.open());add('Comparison report…',()=>folderReport.open());add('Selected entries report…',reportSelectedFolders,!selection.size);local('Text file report…',reportFolderTextFiles,!selectedTextReportRows());local('Save left folder snapshot…',()=>saveFolderSnapshot('a'),!folders.a);local('Save right folder snapshot…',()=>saveFolderSnapshot('b'),!folders.b);local('Compare snapshots…',compareSnapshots);});
 if(type!=='folder-compare'){group('Direction',()=>{for(const [value,label]of [['a-to-b','Left → Right'],['b-to-a','Right → Left']])add(label,()=>{$('folderDirection').value=value;markDirty();},$('folderDirection').value===value||(type==='folder-sync'&&$('folderSyncMode').value==='update-both'));separator();add('Review '+(type==='folder-sync'?'sync':'merge')+' changes',previewPlan,!selection.size);},'local');}
 group('Session & tools',()=>{
  local('Apply patch to folder…',()=>folderPatchDialog.open(side),!folders[side],false,true);
  add('New Window',()=>command('new-window'),false,false,true);
  group('New comparison',()=>{for(const value of types)add(value==='folder-merge3'?'Three-way Folder Merge':value.split('-').map(word=>word[0].toUpperCase()+word.slice(1)).join(' '),()=>command('new:'+value),false,false,true);});
  local(sessionLocked?'Unlock saved session':'Lock saved session',()=>changeSessionLock(!sessionLocked),!savedPath,false,true);
  for(const [label,action]of [['Open workspace…','open-workspace'],['Save workspace as…','save-workspace'],['Open session…','open-session'],['Save session','save-session'],['Save session as…','save-session-as'],['Clear session…','clear-session'],['Close session','close-session'],['Close other sessions','close-other-sessions']])add(label,()=>command(action),action==='close-other-sessions'&&tabs.size<2,false,true,['save-workspace','save-session','save-session-as'].includes(action)?'local':'read');
  separator();
  for(const [label,action]of [['Batch comparisons…','batch:open'],['File manager integration…','shell:setup'],['External editor settings…','editor:settings'],['Import / export settings…','settings:transfer'],['Session defaults…','session:defaults'],['Keyboard shortcuts…','keyboard:settings']])add(label,()=>command(action),false,false,true);
 });
 folderContextMenu??=createContextMenu('folderContext');
 folderContextMenu.open(entries,x,y,()=>{if(!blank)focusFolderRow(side,row.id);else $('folderRows'+side.toUpperCase())?.focus();});
}
document.addEventListener('pointerdown',event=>{folderTypeAhead.text='';if(!event.target.closest('#folderContext'))closeFolderContext();});
document.addEventListener('focusin',event=>{if(!event.target.closest('.folder-entry'))folderTypeAhead.text='';});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeFolderContext();});
window.addEventListener('resize',closeFolderContext);
function folderPaneKey(event,side){
 if(event.target!==event.currentTarget)return;
 if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){
  event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();folderContext(side,null,rect.left+16,rect.top+16);return;
 }
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selectAllFolders(side);return;}
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
  event.preventDefault();const rows=visibleFolders().filter(row=>row[side==='a'?'kindA':'kindB']);
  const row=event.key==='ArrowUp'||event.key==='End'?rows.at(-1):rows[0];
  if(row){if((event.ctrlKey||event.metaKey)&&!event.shiftKey)focusFolderRow(side,row.id);else selectFolderRow(side,row,event);document.activeElement?.scrollIntoView({block:'nearest'});}return;
 }
 if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();runFolderWhenIdle(()=>folderAction('delete',side));}
}
function folderKey(event,side,row){
 const rows=visibleFolders().filter(item=>item[side==='a'?'kindA':'kindB']),index=rows.findIndex(item=>item.id===row.id);
 const time=performance.now(),context=JSON.stringify([activeId,folderRootEpoch,side,folderViewState,$('folderSearch').value,$('folderInclude').value,$('folderExclude').value]);
 const continuing=folderTypeAhead.text&&time-folderTypeAhead.time<1000&&folderTypeAhead.context===context&&folderTypeAhead.path===row.id;
 const printable=!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&[...event.key].length===1&&(event.key!==' '||continuing);
 if(printable){
  event.preventDefault();
  const key=event.key.normalize('NFC').toLocaleLowerCase(),previous=continuing?folderTypeAhead.text:'';
  const cycling=previous===key;let query=cycling?key:(previous+key).slice(0,255);
  const find=prefix=>{const start=previous&&!cycling?index:index+1;for(let offset=0;offset<rows.length;offset++){const candidate=rows[(start+offset+rows.length)%rows.length];if(folderRowName(candidate,side).normalize('NFC').toLocaleLowerCase().startsWith(prefix))return candidate;}};
  let target=find(query);if(!target&&previous){query=key;target=find(query);}
  if(target){selectFolderRow(side,target);document.activeElement?.scrollIntoView({block:'nearest'});}
  folderTypeAhead={text:query,time,context,path:target?.id||row.id};return;
 }
 folderTypeAhead.text='';
 if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();selectAllFolders(side);return;}
 if(['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key)){event.preventDefault();let next=event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)));
  if(event.key==='PageDown'||event.key==='PageUp'){
   const current=event.currentTarget,viewport=current.closest('.folder-panes'),direction=event.key==='PageDown'?1:-1;
   const height=current.getBoundingClientRect().height,heading=(viewport?.querySelector('.folder-columns')?.getBoundingClientRect().height||0)+(viewport?.querySelector('.folder-pane>header')?.getBoundingClientRect().height||0);
   const target=current.offsetTop+direction*Math.max(height,(viewport?.clientHeight||height)-heading-height);
   const elements=new Map([...current.parentElement.children].map(el=>[el.dataset.id,el]));let distance=Infinity;next=index;
   for(let i=index+direction;i>=0&&i<rows.length;i+=direction){const el=elements.get(rows[i].id);if(!el)continue;const gap=Math.abs(el.offsetTop-target);if(gap>distance)break;distance=gap;next=i;}
  }
  if(rows[next]){if((event.ctrlKey||event.metaKey)&&!event.shiftKey)focusFolderRow(side,rows[next].id);else selectFolderRow(side,rows[next],event);document.activeElement?.scrollIntoView({block:'nearest'});}return;}
 if(event.key===' '){event.preventDefault();selectFolderRow(side,row,{ctrlKey:true});}
 if(event.key==='Enter'){event.preventDefault();event.stopPropagation();runFolderWhenIdle(()=>row[side==='a'?'kindA':'kindB']==='directory'?toggleFolder(row.id):openFolderText(row));}
 if(event.key==='F2'){event.preventDefault();runFolderWhenIdle(()=>renameEntry(side,row));}
 if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();runFolderWhenIdle(()=>folderAction('delete',side));}
 if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();folderContext(side,row,rect.left+32,rect.bottom);}
 if(['ArrowLeft','ArrowRight'].includes(event.key)&&folderViewState.mode==='tree'){
  event.preventDefault();const expand=event.key==='ArrowRight',directory=row[side==='a'?'kindA':'kindB']==='directory'&&!row.alignmentConflict;
  if(directory&&expand!==expandedFolders.has(row.id)){runFolderWhenIdle(()=>{if(expand!==expandedFolders.has(row.id))return toggleFolder(row.id);});return;}
  const parent=row.parentId;
  const target=expand&&directory?rows.find(item=>item.parentId===row.id):!expand?rows.find(item=>item.id===parent):null;
  if(target){if((event.ctrlKey||event.metaKey)&&!event.shiftKey)focusFolderRow(side,target.id);else selectFolderRow(side,target,event);document.activeElement?.scrollIntoView({block:'nearest'});}
 }
}
const folderSummaryCache=createFolderSummaryCache();
function folderParentDifferences(){const {include,exclude,query}=folderFilterOptions(),masks={include,exclude,query};return folderSummaryCache.summarize(filterEntries(ignoredFolderRows(),masks),expandedFolders,JSON.stringify([activeId,folderRootEpoch,folderViewState.mode,masks,folderIgnoredMarks]));}
function folderDifferences(rows=visibleFolders()){return rows.filter(row=>['left','right','different','changed','conflict'].includes(row.status));}
function reconcileFolderDifference(rows){if(!folderDifferences(rows).some(row=>row.id===folderDifferenceId))folderDifferenceId=null;}
function applyFolderRowStatus(el,row,side,changedParents){
 const kind=row[side==='a'?'kindA':'kindB'];
 el.className='folder-entry '+row.status+(!kind?' missing':'')+(sideSelection[side].has(row.id)?' selected':'');
 el.classList.toggle('current-difference',row.id===folderDifferenceId);if(row.id===folderDifferenceId)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');
 el.dataset.comparison=row.comparison||'pending';el.classList.toggle('metadata-match',row.status==='equal'&&row.comparison==='metadata');el.classList.toggle('text-normalized-match',row.status==='equal'&&row.comparison==='text-normalized');
 el.title=row.comparison==='text-normalized'?`Text comparison — ${folderTextIgnored(folderRules.mode).replace('spaces and tabs','spaces/tabs')} and line-ending styles ignored; matching text does not mean identical bytes`:row.comparison==='metadata'?'Metadata comparison — file contents not verified':row.comparison==='content'?'Content comparison':'';
 if(row.metadataDifferences?.length)el.title+=(el.title?' · ':'')+row.metadataDifferences.map(key=>folderMetadataLabels[key]||key).join(', ')+' differ'+(row.contentStatus==='equal'?' · File comparison matches under the current method':row.contentStatus==='directory'||row.contentStatus==='unchecked'?' · Folder contents are not verified by this result':'');
 el.setAttribute('aria-label',folderRowName(row,side)+(!kind?' — not present':row.status==='equal'&&row.comparison==='text-normalized'?`, text match ignoring ${folderTextIgnored(folderRules.mode)}`:', '+row.status));
 el.classList.toggle('filter-suppressed',!!row.filterSuppressed);
 const childDifferences=changedParents.has(row.id);el.classList.toggle('contains-differences',childDifferences);
 if(childDifferences){el.title='Contains differences in loaded entries matching the filename filters. Collapsed results are cached until refreshed. Unopened contents are unchecked.';if(row.metadataDifferences?.length)el.title+=(el.title?' · ':'')+row.metadataDifferences.map(key=>folderMetadataLabels[key]||key).join(', ')+' differ'+(row.contentStatus==='equal'?' · File comparison matches under the current method':row.contentStatus==='directory'||row.contentStatus==='unchecked'?' · Folder contents are not verified by this result':'');
 el.setAttribute('aria-label',folderRowName(row,side)+', contains differences in loaded entries; unopened contents unchecked');}
 if(row.ignored){el.title='Ignored in this tab · Actual result: '+row.actualStatus+'. Original results and file operations are unchanged.';if(row.metadataDifferences?.length)el.title+=(el.title?' · ':'')+row.metadataDifferences.map(key=>folderMetadataLabels[key]||key).join(', ')+' differ'+(row.contentStatus==='equal'?' · File comparison matches under the current method':row.contentStatus==='directory'||row.contentStatus==='unchecked'?' · Folder contents are not verified by this result':'');
 el.setAttribute('aria-label',folderRowName(row,side)+', ignored; actual result '+row.actualStatus);}
 if(row.filterSuppressed){el.title+=' · Hidden by the current filters';el.setAttribute('aria-label',el.getAttribute('aria-label')+', hidden by current filters');}
}
function refreshFolderRowStatuses(){
 const rows=visibleFolders(),changedParents=folderParentDifferences();reconcileFolderDifference(rows);
 for(const side of ['a','b']){const elements=$('folderRows'+side.toUpperCase()).children;if(elements.length!==rows.length||rows.some((row,index)=>elements[index].dataset.id!==row.id)){folderTable();return;}}
 for(const side of ['a','b']){const elements=$('folderRows'+side.toUpperCase()).children;rows.forEach((row,index)=>applyFolderRowStatus(elements[index],row,side,changedParents));}
 updateSelected();
}
function folderTable(){
 folderViewControls();$('folderShowHidden').setAttribute('aria-pressed',String(folderSuppressedTabs.has(activeId)));$('folderShowHidden').textContent=folderSuppressedTabs.has(activeId)?'Restore filters':'Show hidden';
 const hadFocus=Boolean(document.activeElement?.closest('.folder-entry'))||['folderRowsA','folderRowsB'].includes(document.activeElement?.id);
 const rows=visibleFolders(),changedParents=folderParentDifferences();reconcileFolderDifference(rows);
 for(const side of ['a','b']){const visible=new Set(rows.filter(row=>row[side==='a'?'kindA':'kindB']).map(row=>row.id));sideSelection[side]=new Set([...sideSelection[side]].filter(path=>visible.has(path)));}
 if(!rows.some(row=>row.id===folderFocus.path&&row[folderFocus.side==='a'?'kindA':'kindB'])){
  const kindKey=folderFocus.side==='a'?'kindA':'kindB',available=new Set(rows.filter(row=>row[kindKey]).map(row=>row.id));
  const previous=[...$('folderRows'+folderFocus.side.toUpperCase()).children].filter(el=>!el.classList.contains('missing')).map(el=>el.dataset.id),index=previous.indexOf(folderFocus.path);
  // Keep keyboard browsing near a removed entry, without selecting a replacement.
  const nearby=index<0?null:previous.slice(index+1).find(id=>available.has(id))||previous.slice(0,index).reverse().find(id=>available.has(id));
  folderFocus={side:folderFocus.side,path:nearby||rows.find(row=>row[kindKey])?.id||null};
 }
 for(const side of ['a','b']){
  const fragment=document.createDocumentFragment();
  for(const row of rows){
   const kind=row[side==='a'?'kindA':'kindB'],el=document.createElement('div');
   el.role='row';el.dataset.id=row.id;el.dataset.path=folderRowPath(row,side);el.dataset.side=side;applyFolderRowStatus(el,row,side,changedParents);
   const name=document.createElement('span');name.className='entry-name';name.role='gridcell';name.style.paddingLeft=(4+(row.depth||0)*16)+'px';
   const toggle=document.createElement(kind==='directory'?'button':'span');toggle.className='tree-toggle';toggle.textContent=kind==='directory'?(expandedFolders.has(row.id)?'▾':'▸'):'';
   if(kind==='directory'){toggle.disabled=Boolean(row.alignmentConflict);if(row.alignmentConflict)toggle.title='Clear alignment before expanding this changed entry.';toggle.tabIndex=-1;toggle.setAttribute('aria-label',(expandedFolders.has(row.id)?'Collapse ':'Expand ')+folderRowName(row,side));el.setAttribute('aria-expanded',String(expandedFolders.has(row.id)));toggle.onclick=event=>{event.stopPropagation();selectFolderRow(side,row);if(event.detail>1)return;const expand=!expandedFolders.has(row.id);runFolderWhenIdle(()=>{if(expand!==expandedFolders.has(row.id))return toggleFolder(row.id);});};toggle.ondblclick=event=>{event.preventDefault();event.stopPropagation();};}
   const icon=document.createElement('span');icon.className='entry-icon '+(kind==='directory'?'folder-icon':'file-icon');icon.setAttribute('aria-hidden','true');icon.hidden=!kind;
   const label=document.createElement('span');label.className='entry-label';label.textContent=kind?(folderViewState.mode!=='tree'?folderRowPath(row,side):folderRowName(row,side)):'';name.append(toggle,icon,label);name.title=kind?folderRowPath(row,side):'Not present on this side';
   const size=document.createElement('span');size.className='entry-size';size.role='gridcell';size.textContent=kind==='file'?row[side==='a'?'sizeA':'sizeB'].toLocaleString():'';
   const modified=document.createElement('span');modified.className='entry-modified';modified.role='gridcell';const timestamp=row[side==='a'?'mtimeA':'mtimeB'];modified.textContent=kind&&timestamp!=null?new Date(timestamp).toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
   el.append(name,size,modified);
   el.oncontextmenu=event=>{event.preventDefault();event.stopPropagation();folderContext(side,kind?row:null,event.clientX,event.clientY);};
   if(kind){el.onfocus=()=>{folderFocus={side,path:row.id};syncFolderSelection();};el.onclick=event=>selectFolderRow(side,row,event);el.ondblclick=event=>{event.preventDefault();runFolderWhenIdle(()=>kind==='directory'?toggleFolder(row.id):openFolderText(row));};el.onkeydown=event=>folderKey(event,side,row);}
   fragment.append(el);
  }
  const container=$('folderRows'+side.toUpperCase());container.tabIndex=-1;container.onfocus=event=>{if(event.target===container){folderFocus={side,path:null};syncFolderSelection();}};container.onkeydown=event=>folderPaneKey(event,side);container.setAttribute('role','treegrid');container.setAttribute('aria-multiselectable','true');container.parentElement.oncontextmenu=event=>{if(event.target.closest('.folder-entry')||event.target.closest('button'))return;event.preventDefault();folderContext(side,null,event.clientX,event.clientY);};container.replaceChildren(fragment);
 }
 expansionControls();$('folderBreadcrumb').textContent=folderViewState.mode==='filename'?'Filename matches':'Folder tree';$('folderUp').disabled=['recursive','filename'].includes(folderViewState.mode)||!expandedFolders.size;$('folderEmpty').hidden=rows.length>0;$('folderEmpty').textContent=disconnectedFolders()?'Saved remote folders are disconnected. Use Reconnect above to sign in and compare.':folders.a||folders.b?'This folder has no matching entries':'Choose folders to browse';syncFolderSelection();if(hadFocus)focusFolderRow(folderFocus.side,folderFocus.path);
}
function updateSelected(){$('comparePair').disabled=!selectedFolderPair();if($('alignFolderPair'))$('alignFolderPair').disabled=operation||!selectedFolderPair();if($('clearFolderAlignment'))$('clearFolderAlignment').disabled=operation||!folderAlignmentPairs.length;$('folderSelection').textContent=sideSelection.a.size&&sideSelection.b.size?`${sideSelection.a.size} left · ${sideSelection.b.size} right selected`:selection.size?`${selection.size} selected`:'';$('previewPlan').disabled=!selection.size;$('changeCount').textContent=isFolder()?ignoredFolderRows().filter(r=>['left','right','conflict','different','changed'].includes(r.status)).length:result?.hunks.length||0;navigation();}
let folderCompareBusy=false,folderCompareTimer,folderCompareRequested=false,folderComparePendingOnly=false;
const metadataKey=row=>JSON.stringify([row.id,row.alignmentRevision,row.pathA,row.pathB,row.kindA,row.kindB,row.sizeA,row.sizeB,row.mtimeA,row.mtimeB,row.versionA,row.versionB]);
function folderSummary(comparing=false){const rows=ignoredFolderRows(),ignored=rows.filter(row=>row.ignored).length;const counts={equal:0,changed:0,different:0,conflict:0,left:0,right:0,unchecked:0};for(const row of rows)if(row.status in counts)counts[row.status]++;$('folderSummary').textContent=`${folderRows.length} entries · ${isFolderTextRule(folderRules.mode)?`${rows.filter(row=>row.status==='equal'&&row.comparison==='content').length} byte matches · ${rows.filter(row=>row.status==='equal'&&row.comparison==='text-normalized').length} text matches`:`${counts.equal} ${folderRules.mode==='content'?'identical':'metadata matches'}`} · ${counts.changed+counts.different} different · ${counts.left+counts.right} one-sided${counts.conflict?` · ${counts.conflict} conflicts`:""}${counts.unchecked?` · ${counts.unchecked} pending`:""}${ignored?' · '+ignored+' ignored in this tab':''}${comparing?' · Comparing visible folders…':''}`;}
function queueFolderComparison(pendingOnly=false){if(disconnectedFolders())return;if(stoppedFolderComparisons.has(activeId))return;folderComparePendingOnly=folderCompareRequested?folderComparePendingOnly&&pendingOnly:pendingOnly;folderCompareRequested=true;expansionControls();clearTimeout(folderCompareTimer);folderCompareTimer=setTimeout(compareVisibleFolders,80);}
async function compareVisibleFolders(){if(stoppedFolderComparisons.has(activeId)||folderCompareBusy||expansionTask||operation||!activeId||!isFolder()||folderViewState.mode==='recursive')return;folderCompareBusy=true;const pendingOnly=folderComparePendingOnly;folderCompareRequested=false;const id=activeId,rootEpoch=folderRootEpoch,stopSerial=folderStopSerial;const nodes=['root',...expandedFolders].filter(path=>path==='root'||folderRows.some(row=>row.id===path&&(row.kindA==='directory'||row.kindB==='directory')));folderSummary(true);
 try{for(const node of nodes){
  if(stopSerial!==folderStopSerial||activeId!==id||rootEpoch!==folderRootEpoch||!isFolder()||expansionTask||operation)break;
  if(node!=='root'&&(!expandedFolders.has(node)||!folderRows.some(row=>row.id===node)))continue;
  if(pendingOnly&&!folderRows.some(row=>row.parentId===node&&(['unchecked','different'].includes(row.status)||(folderMetadataKeys.some(key=>folderRules[key])&&row.kindA==='directory'&&row.kindB==='directory'&&row.contentStatus===undefined))))continue;
  const requested=new Map(folderRows.filter(row=>row.parentId===node||row.id===node).map(row=>[row.id,metadataKey(row)]));
  const compared=await readFolderNode(node,true);
  if(activeId!==id||!isFolder()||rootEpoch!==folderRootEpoch)break;
  if(node!=='root'&&!expandedFolders.has(node))continue;
  const updated=new Map(compared.rows.map(row=>[row.id,row]));if(compared.parentRow)updated.set(compared.parentRow.id,compared.parentRow);
  let changed=false,metadataChanged=false;
  folderRows=folderRows.map(row=>{
   const fresh=updated.get(row.id);if(!fresh)return row;
   const currentKey=metadataKey(row),sameMetadata=metadataKey(fresh)===currentKey;
   // A concurrent metadata scan wins over an older comparison response.
   if(!sameMetadata&&requested.get(row.id)!==currentKey)return row;
   if(!sameMetadata)metadataChanged=true;
   if(!sameMetadata||fresh.status!==row.status||fresh.comparison!==row.comparison||fresh.contentStatus!==row.contentStatus||JSON.stringify(fresh.metadataDifferences)!==JSON.stringify(row.metadataDifferences))changed=true;
   return {...fresh,depth:row.depth};
  });
  if(metadataChanged)folderTable();else if(changed)refreshFolderRowStatuses();
 }}
 catch(error){if(stopSerial===folderStopSerial&&activeId===id&&isFolder()&&rootEpoch===folderRootEpoch)notify('Folder comparison: '+error.message,true);}
 finally{folderCompareBusy=false;if(activeId===id&&isFolder())folderSummary();expansionControls();if(folderCompareRequested){clearTimeout(folderCompareTimer);folderCompareTimer=setTimeout(compareVisibleFolders,80);}}
}
async function scan(quiet=false,preserveSummaries=false,autoExpandFrom=null){if(disconnectedFolders()){folderRows=[];selection.clear();sideSelection={a:new Set(),b:new Set()};folderScanInfo={state:'disconnected',skipped:0};folderTable();folderSummary();return;}if(!quiet)stoppedFolderComparisons.delete(activeId);if(folderViewState.mode==='filename'){if(!quiet)return scanFilenameMatching();return;}if(!quiet&&!preserveSummaries)folderSummaryCache.reset();if(folderViewState.mode==='recursive'){if(!quiet)startRecursiveListing();return;}if(expansionTask||(!folders.a&&!folders.b))return;folderScanInfo={...folderScanInfo,state:'running'};let data;try{data=await readFolderTree(autoExpandFrom);}catch(error){folderScanInfo={...folderScanInfo,state:'partial'};throw error;}folderScanInfo={state:'loaded',skipped:data.skipped||0};const previous=new Map(folderRows.map(row=>[row.id,row]));for(const row of data.rows){const old=previous.get(row.id);if(old&&metadataKey(old)===metadataKey(row)&&['equal','changed'].includes(old.status)){row.status=old.status;row.comparison=old.comparison;if(old.contentStatus!==undefined)row.contentStatus=old.contentStatus;else delete row.contentStatus;if(old.metadataDifferences!==undefined)row.metadataDifferences=[...old.metadataDifferences];else delete row.metadataDifferences;}}const changed=JSON.stringify(data.rows)!==JSON.stringify(folderRows);if(changed&&!preserveSummaries)folderSummaryCache.reset();folderRows=data.rows;for(const side of ['a','b']){const existing=new Set(folderRows.filter(row=>row[side==='a'?'kindA':'kindB']).map(row=>row.id));sideSelection[side]=new Set([...sideSelection[side]].filter(path=>existing.has(path)));}selection=new Set([...sideSelection.a,...sideSelection.b]);if(!quiet){plan=null;folderDifferenceId=null;}folderSummary();if(changed||!quiet)folderTable();queueFolderComparison(preserveSummaries);}
function fileComparisonType(name){const extension=name.split('.').pop().toLowerCase();return ['png','jpg','jpeg','webp','gif'].includes(extension)?'picture-compare':['wav','aif','aiff','flac','mp3'].includes(extension)?'audio-compare':['csv','tsv','xlsx','ods','xls','xlsb'].includes(extension)?'table-compare':['zip','jar','tar','tgz','gz'].includes(extension)?'archive-compare':extension==='reg'?'registry-compare':['bin','dat','exe','dll','so','dylib','class'].includes(extension)?'binary-compare':null;}
function confirmDecryptedArchiveChild(name){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.id='decryptedArchiveChildDialog';dialog.className='text-options-dialog';dialog.setAttribute('aria-labelledby','decryptedArchiveChildTitle');
  dialog.innerHTML='<header><h2 id="decryptedArchiveChildTitle">Open decrypted comparison?</h2></header><p data-entry style="overflow-wrap:anywhere"></p><p>This comparison will contain decrypted file contents. Saving its session or workspace, exporting a report, or saving files can store those contents without encryption.</p><p>The original encrypted archive stays unchanged. This child comparison cannot apply edits back to that archive. Passwords are not saved.</p><footer><button type="button" class="button" data-cancel>Cancel</button><button type="button" class="button primary" data-open>Open decrypted comparison</button></footer>';
  dialog.querySelector('[data-entry]').textContent='Entry: '+name;let settled=false;
  const finish=accepted=>{if(settled)return;settled=true;dialog.remove();resolve(accepted);};
  dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.querySelector('[data-open]').onclick=()=>finish(true);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
 });
}
async function openDataComparison(out,originTabId,nativeId=null,requestedMode=null){if(out.decryptedArchiveEntry===true){const parent=tabs.get(originTabId);if(activeId!==originTabId||parent?.data?.type!=='archive-compare')throw Error('Reopen this entry from its encrypted archive.');const inputState=archiveEditor.getState().inputs,candidate=structuredClone(out);if(!await confirmDecryptedArchiveChild(candidate.name))return;if(activeId!==originTabId||tabs.get(originTabId)!==parent||archiveEditor.getState().inputs.a!==inputState.a||archiveEditor.getState().inputs.b!==inputState.b)throw Error('The archive comparison changed. Open the entry again.');delete candidate.archiveEntry;out=candidate;}let mode=requestedMode||fileComparisonType(out.name),decoded={};if(!mode||mode==='text-compare'){try{for(const side of ['a','b'])if(out[side]){const data=await decodeTextInput(Uint8Array.from(atob(out[side].data),c=>c.charCodeAt(0)),out[side].name||out.name);validate(data.content);decoded[side]={...data,name:out[side].name||out.name,path:'',source:out[side].source};}mode='text-compare';}catch(error){if(isDocumentInput(out.name)||['a','b'].some(side=>isDocumentInput(out[side]?.name||'')))throw error;mode='binary-compare';}}
 return lockedWorkspaceInput(async()=>{snapshot();const previous=activeId,prior=tabs.get(previous);let opened=null;try{await newSessionUnlocked(mode,nativeId);opened=activeId;parentTabId=originTabId;if(mode==='text-compare'){for(const side of ['a','b'])if(decoded[side])setLoaded(side,decoded[side],decoded[side].documentProjection?.kind==='pdf'?new File([Uint8Array.from(atob(out[side].data),c=>c.charCodeAt(0))],decoded[side].name,{type:'application/pdf'}):null);if(out.archiveEntry)archiveEntryLink={parentId:originTabId,reference:out.archiveEntry,sides:out.archiveEntry.sides.filter(side=>!decoded[side]?.documentProjection)};refreshArchiveEntryActions();compute();}else{const saved={inputs:{a:out.a,b:out.b,base:null},options:currentEditor().getState().options};if(dedicatedEditors[mode])await dedicatedEditors[mode].setState(saved);else await dataEditor.setType(mode,saved);if(['binary-compare','table-compare','registry-compare'].includes(mode)&&out.archiveEntry){archiveEntryLink={parentId:originTabId,reference:out.archiveEntry,sides:out.archiveEntry.sides.filter(side=>mode!=='registry-compare'||/\.reg$/i.test(out.archiveEntry.path||'')&&/\.reg$/i.test(out[side]?.name||''))};refreshArchiveEntryActions();}}$('sessionName').value=out.name;markDirty();snapshot();if(out.remote)notify(out.mode==='folder-compare'?'Opened the selected folders in a comparison tab.':'Opened remote files. Use Save to server when available, or Save as for a local copy.');}catch(error){await rollbackWorkspace(previous,prior,error,opened);}});}
function inheritFolderTextRules(rules){textGrammar=isFolderTextRule(rules.mode)?validateTextGrammar(rules.textGrammar):validateTextGrammar();textProfileMappings=validateTextProfileMappings(rules.textProfileMappings);$('textProfile').value=isFolderTextRule(rules.mode)?validateTextProfile(rules.textProfile):'plain';ignoredTextPatterns=isFolderTextRule(rules.mode)?validateIgnoredTextPatterns(rules.ignoredTextPatterns):[];$('ignoreBlankLines').checked=isFolderTextRule(rules.mode)&&rules.ignoreBlankLines===true;for(const side of ['A','B'])$('readEncoding'+side).value=folderEncodings(rules)[side.toLowerCase()];if(rules.mode==='content'){$('ignoreWhitespace').checked=false;$('ignoreCase').checked=false;$('showMinor').checked=false;return;}if(!isFolderTextRule(rules.mode))return;$('ignoreWhitespace').checked=['text-whitespace','text-whitespace-case'].includes(rules.mode);$('ignoreCase').checked=['text-case','text-whitespace-case'].includes(rules.mode);$('whitespaceScope').value=rules.textWhitespaceScope||'horizontal';$('showMinor').checked=true;}
async function openFolderText(row,requestedMode=null){stopExpansion();const originTabId=activeId,rules={...folderRules};if((row.actualStatus||row.status)==='conflict')throw Error('This entry is a file on one side and a folder on the other.');const mode=requestedMode||fileComparisonType(folderRowName(row));if(mode&&mode!=='text-compare'){const out=await openTrackedFolderFile(ticket=>desktop.openFolderTreeData(row.id,folderTreeRevision,ticket));return openDataComparison({...out,name:folderRowName(row)},originTabId,out.id,mode);}const out=await openTrackedFolderFile(ticket=>desktop.openFolderTreeFiles(row.id,folderTreeRevision,folderEncodings(rules),ticket));await newSession('text-compare',out.id);parentTabId=originTabId;for(const side of ['a','b'])if(out[side])setLoaded(side,out[side]);inheritFolderTextRules(rules);$('sessionName').value=folderRowName(row);markDirty();snapshot();compute();if(out.remote)notify(out.mode==='folder-compare'?'Opened the selected folders in a comparison tab.':'Opened remote files. Use Save to server when available, or Save as for a local copy.');}
function folderOperationScope(){const {include,exclude,query,status}=folderFilterOptions();return {...(folderAllContentsTabs.has(activeId)?{include:'*',exclude:'',query:'',status:'all'}:{include,exclude,query,status}),rules:{...folderRules}};}
function transferActionLabel(action){return {'create-directory':'Create folder','finalize-directory':'Set folder metadata',copy:'Copy file',rename:'Rename file',delete:'Delete file',skip:'Keep identical file'}[action]||action||'File';}
function transferPath(item){const source=item.sourcePath??item.source,target=item.targetPath??item.target??item.path;return source&&target&&source!==target?source+' → '+target:target||source||'Entry';}
function displayPlan(description){
 $('cancelPlan').textContent='Cancel';$('cancelPlan').disabled=false;$('applyPlan').hidden=false;
 if(plan.operationScope){const scope=plan.operationScope;description+='\nFile-action scope: include '+scope.include+'; exclude '+(scope.exclude||'none')+'; search '+(scope.query||'none')+'; status '+scope.status+'. Hidden descendants outside this scope are retained.';}
 $('planTitle').textContent=plan.mode==='delete'&&plan.remoteTransfer?'Review remote deletion':plan.mode==='rename'?'Review remote rename':`${plan.operations.length} planned operations`;
 if(plan.remoteTransfer&&plan.recursive){
  const files=plan.operations.filter(op=>op.action==='copy').length,folders=plan.operations.filter(op=>op.action==='create-directory').length;
  $('planTitle').textContent=[files+' file'+(files===1?'':'s')+' to copy',folders+' folder'+(folders===1?'':'s')+' to create'].join(' · ');
  if(plan.skipped)description+='\n'+plan.skipped+' identical file'+(plan.skipped===1?'':'s')+' will be kept.';
  if(plan.excluded)description+='\n'+plan.excluded+' entries are outside this copy scope.';
 }
 $('planDescription').textContent=description;
 const fragment=document.createDocumentFragment(),metadata=[];
 for(const op of plan.operations){
  const div=document.createElement('div');
  if(plan.remoteTransfer){div.dataset.action=op.action;div.textContent=transferActionLabel(op.action)+' · '+transferPath(op)+(op.overwrite&&op.action==='copy'?' — replace existing file':'');if(op.action==='finalize-directory'){metadata.push(div);continue;}}
  else div.textContent=`${op.sourceSide?(op.sourceSide==='a'?'Left → Right':'Right → Left')+' · ':''}${op.action}  ${op.sourcePath&&op.targetPath&&op.sourcePath!==op.targetPath?op.sourcePath+' → '+op.targetPath:op.targetPath||op.path}${op.overwrite&&['copy','move'].includes(op.action)?' — replace existing file':''}`;
  fragment.append(div);
 }
 if(metadata.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Folder metadata · '+metadata.length+' step'+(metadata.length===1?'':'s')+' after copying';details.append(summary,...metadata);fragment.append(details);}
 if(plan.unresolved?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=plan.unresolved.length+' entries need manual review — these will not be copied';details.open=true;details.append(summary);for(const item of plan.unresolved){const line=document.createElement('div');line.textContent=(item.path||item.pathA||item.pathB||'Entry')+' — '+item.reason;details.append(line);}fragment.append(details);}
 $('planOperations').replaceChildren(fragment);$('applyPlan').disabled=!plan.operations.length;$('planDialog').showModal();
}
async function copyToFolder(side){
 const paths=[...sideSelection[side]];if(!paths.length||paths.length>1000)throw Error('Select between 1 and 1000 files or folders.');
 stopExpansion();const preview=await desktop.previewFolderTreeDestination('copy',side,paths,folderTreeRevision,folderOperationScope());if(!preview)return;
 plan=preview;displayPlan(`Copy selected entries from the ${side==='a'?'left':'right'} side.\nSource: ${preview.source}\nDestination: ${preview.destination}\nPaths below are relative to these folders. Selected folders use the file-action scope shown below.`);
}
function showMovePlan(preview,side){plan=preview;displayPlan(`Move selected entries from the ${side==='a'?'left':'right'} side.\nSource: ${preview.source}\nDestination: ${preview.destination}\nPaths are relative to these folders. Selected folders use the file-action scope shown below. Source entries are removed only after destination copies are verified. Backups are retained for recovery.`);}
async function moveToFolder(side){const paths=[...sideSelection[side]];if(!paths.length||paths.length>1000)throw Error('Select between 1 and 1000 files or folders.');stopExpansion();const preview=await desktop.previewFolderTreeDestination('move',side,paths,folderTreeRevision,folderOperationScope());if(preview)showMovePlan(preview,side);}
async function folderAction(action,side){
 const paths=[...sideSelection[side]];if(!paths.length)return;const remote=!!(folders.a?.remote||folders.b?.remote);
 if((action==='move'||remote)&&paths.length>1000)throw Error('Select at most 1000 files or folders.');
 if(action==='delete'&&!canDeleteFolderSelection(side))throw Error('Select one regular remote file to delete.');
 if(remote&&action!=='delete'&&(action!=='copy'||!canCopyFolderSelection(side)))throw Error('Select files or folders with compatible destinations to copy between these folders.');
 stopExpansion();const context=folderActionContext(),serial=folderStopSerial;
 if(remote){while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));if(serial!==folderStopSerial||context!==folderActionContext())throw Error('The folder selection changed. Choose the file action again.');}
 const task=remote?{sessionId:activeId,planId:null,requestId:crypto.randomUUID(),phase:'preview'}:null;
 if(task){folderTransferTask=task;expansionControls();}
 try{const preview=await desktop.previewAlignedFolderAction(action,side,paths,folderTreeRevision,folderOperationScope(),task?.requestId);if(!preview||preview.cancelled)return;if(task&&(task.stopping||serial!==folderStopSerial||context!==folderActionContext())){await desktop.cancelFolderTransfer(task.sessionId,preview.id,task.requestId);return;}if(action==='delete'&&preview.remoteTransfer){plan=preview;displayPlan('Delete one remote file from the '+(side==='a'?'left':'right')+' side.\nFolder: '+preview.source+'\nA local recovery copy is saved before deletion. Review the file below before continuing.');return;}if(action==='move')return showMovePlan(preview,side);plan=preview;displayPlan(`${action==='copy'?'Copy from':'Delete from'} ${side==='a'?'left':'right'}${action==='copy'?' to '+(side==='a'?'right':'left'):''}${preview.remoteTransfer?' · Selected files and folders\nSource: '+preview.source+'\nDestination: '+preview.destination+'\nSelected folders include their descendants within the file-action scope.'+(preview.skipped&&!preview.recursive?'\n'+preview.skipped+' identical files skipped':''):''}`);}
 finally{if(folderTransferTask===task)folderTransferTask=null;$('cancelPlan').disabled=false;$('cancelPlan').textContent='Cancel';expansionControls();}
}
async function previewUpdateBoth(direction='both'){if(!selection.size||!folders.a||!folders.b)throw Error('Select files or folders to update on both sides.');stopExpansion();plan=await desktop.previewUpdateBoth([...selection],folderTreeRevision,folderOperationScope(),direction);displayPlan(`${direction==='both'?'Update both sides':direction==='a-to-b'?'Update right · Left → Right':'Update left · Right → Left'} · Copy newer and one-sided files. Selected folders include their descendants. No deletions.`);}
async function previewMirror(direction){if(!selection.size||!folders.a||!folders.b)throw Error('Select files or folders and open both sides to mirror.');stopExpansion();plan=await desktop.previewAlignedFolders('sync',direction,[...selection],folderTreeRevision,folderOperationScope(),true);displayPlan(`Mirror ${direction==='a-to-b'?'to right · Left → Right':'to left · Right → Left'} · Selected folders include their descendants. Destination-only entries in the selected scope will be deleted.`);}
async function previewPlan(){if(!selection.size||type==='folder-compare')return;if(type==='folder-sync'&&$('folderSyncMode').value!=='mirror')return previewUpdateBoth($('folderSyncMode').value==='update-both'?'both':$('folderDirection').value);stopExpansion();plan=await desktop.previewAlignedFolders(type==='folder-sync'?'sync':'merge',$('folderDirection').value,[...selection],folderTreeRevision,folderOperationScope());displayPlan(`${type==='folder-sync'?'Mirror sync':'Merge'} · ${$('folderDirection').selectedOptions[0].text}`);}

let snapshotReport=null,snapshotPage=0;
async function saveFolderSnapshot(side){if(!desktop||!folders[side])throw Error('Choose a folder on this side first.');const outcome=await desktop.saveFolderSnapshot(side);if(!outcome.cancelled)notify('Snapshot saved: '+outcome.path);}
function renderSnapshotReport(){const rows=snapshotReport.rows.filter(row=>!$('snapshotDiffOnly').checked||row.status!=='equal'),pages=Math.max(1,Math.ceil(rows.length/200));snapshotPage=Math.min(snapshotPage,pages-1);const fragment=document.createDocumentFragment();for(const row of rows.slice(snapshotPage*200,(snapshotPage+1)*200)){const tr=document.createElement('tr');tr.className=row.status;for(const value of [row.path,{equal:'Identical',changed:'Different',left:'Left only',right:'Right only',conflict:'Type conflict'}[row.status]||row.status,bytes(row.sizeA),bytes(row.sizeB)]){const td=document.createElement('td');td.textContent=value;td.style.padding='4px 7px';tr.append(td);}fragment.append(tr);}$('snapshotRows').replaceChildren(fragment);$('snapshotPage').textContent=`${snapshotPage+1} / ${pages}`;$('snapshotPrevious').disabled=snapshotPage===0;$('snapshotNext').disabled=snapshotPage>=pages-1;}
async function compareSnapshots(){if(!desktop)return;const report=await desktop.compareFolderSnapshots();if(!report)return;snapshotReport=report;snapshotPage=0;$('snapshotNames').textContent=report.leftName+' ↔ '+report.rightName;const changed=report.rows.filter(row=>row.status!=='equal').length;$('snapshotSummary').textContent=`${report.rows.length.toLocaleString()} entries · ${changed.toLocaleString()} differences. Read-only saved snapshots; current folders are not modified.`;renderSnapshotReport();$('snapshotDialog').showModal();}
$('snapshotDiffOnly').onchange=()=>{snapshotPage=0;renderSnapshotReport();};$('snapshotPrevious').onclick=()=>{snapshotPage--;renderSnapshotReport();};$('snapshotNext').onclick=()=>{snapshotPage++;renderSnapshotReport();};$('snapshotClose').onclick=()=>$('snapshotDialog').close();$('snapshotExport').onclick=()=>download(JSON.stringify(snapshotReport,null,2),'snapshot-comparison.json','application/json');$('saveSnapshotA').onclick=()=>run(()=>saveFolderSnapshot('a'));$('saveSnapshotB').onclick=()=>run(()=>saveFolderSnapshot('b'));$('compareSnapshots').onclick=()=>run(compareSnapshots);
function historyTextField(element){return !!element&&(element.isContentEditable||element.tagName==='TEXTAREA'||element.tagName==='INPUT'&&!['button','submit','reset','checkbox','radio','range','file','color','image','hidden'].includes(element.type));}
function comparisonHistoryContext(){
 const focused=document.activeElement,dialogs=[...document.querySelectorAll('dialog[open]')];
 // Alignment changes use comparison history, while its numeric fields retain
 // native editing history. Every other modal keeps the comparison isolated.
 const alignmentOnly=dialogs.length===1&&dialogs[0].id==='alignmentDialog';
 return activeId&&!isFolder()&&!isAdvanced()&&(dialogs.length===0||alignmentOnly&&!historyTextField(focused))&&(!historyTextField(focused)||focused===$('textA')||focused===$('textB'));
}
function standardHistory(action){if(workspaceInputLocked)return;
 const stack=action==='undo'?undo:redo;
 const focused=document.activeElement,editable=historyTextField(focused);
 if(activeId&&!operation&&!document.querySelector('dialog[open]')&&!editable&&['binary-compare','table-compare','text-merge3','archive-compare'].includes(type))return command(action);
 if(comparisonHistoryContext()&&stack.length){if(!operation)action==='undo'?undoMerge():redoMerge();return;}
 if(desktop?.nativeEditHistory)return desktop.nativeEditHistory(action);
 document.execCommand(action);
}
async function command(action){if(workspaceInputLocked)return;if(action==='edit:undo'||action==='edit:redo')return standardHistory(action.slice(5));if(action==='archive:back-to-parent')return runArchiveEntryContext(archiveEntryContext());if(action==='archive:apply-entry-left'||action==='archive:apply-entry-right')return runArchiveEntryContext(archiveEntryContext(),action.endsWith('left')?'a':'b'); if(action==='text:apply-patch'){$('textOptionsDialog')?.close();document.querySelectorAll('.menu[open]').forEach(el=>el.open=false);return textPatchApply.open();}if(action==='text:export-patch'){$('textOptionsDialog')?.close();document.querySelectorAll('.menu[open]').forEach(el=>el.open=false);return textPatch.open();}if(action==='new-window'){if(desktop?.newWindow)return runWhenIdle(()=>desktop.newWindow());notify('New windows require the desktop app.');return;}if(type==='folder-merge3'){if(action==='open-a'||action==='open-b')return threeWayEditor.selectSide(action==='open-a'?'left':'right');if(action==='reload')return threeWayEditor.analyze();}if(type==='folder-merge3'&&(['undo','redo','previous','next','copy-left','copy-right','snapshot-save-left','snapshot-save-right','snapshot-compare','editor:left','editor:right'].includes(action)||action.startsWith('folder:')||action.startsWith('filter:'))){notify('Use the folder review controls for this session.');return;}if(action==='text:show-minor'){if(isFolder()||isAdvanced())return;$('showMinor').checked=!$('showMinor').checked;markDirty();applyFilter();return;}if(action==='batch:open')return batchDialog.open();if(action==='keyboard:settings')return keyboardShortcuts.open();if(action==='compare-now')return compute();if(action==='session:defaults')return sessionDefaults.open();if(action==='settings:transfer')return settingsTransfer.open();if(action==='editor:settings')return externalEditorSettings.open();if(action==='editor:left'||action==='editor:right')return runWhenIdle(()=>openTextExternally(action==='editor:left'?'a':'b'));if(action==='shell:setup')return shellSetup.open();if(action==='alignment')return openAlignment();if(action.startsWith('clipboard:'))return run(()=>pasteClipboard(action==='clipboard:paste-right'?'b':'a',action==='clipboard:compare-new'));if(action==='session:back-to-folder')return runWhenIdle(backToFolder);if(type==='archive-compare'&&(action==='undo'||action==='redo'))return runWhenIdle(()=>archiveEditor[action]());if(['binary-compare','table-compare','text-merge3'].includes(type)&&(action==='undo'||action==='redo'))return runWhenIdle(()=>dataEditor[action]());if(type==='text-merge3'&&(action==='previous'||action==='next'))return dataEditor.navigateConflict(action==='previous'?-1:1);if(action==='undo')return undoMerge();if(action==='redo')return redoMerge();if(action==='appearance'){displaySettings.open();return;}if(action==='folder:stop')return stopExpansion('Comparison stopped',true);if(isFolder()&&['text:find','text:find-next','text:find-previous'].includes(action))return runFolderWhenIdle(()=>findFilename(action==='text:find'?'find':action==='text:find-next'?'next':'previous'));if(action.startsWith('text:')){if(isFolder()||isAdvanced())return;showInputs();textTools.command(action.slice(5));if(action.startsWith('text:bookmark'))markDirty();return;}if(action==='snapshot-save-left')return run(()=>saveFolderSnapshot('a'));if(action==='snapshot-save-right')return run(()=>saveFolderSnapshot('b'));if(action==='snapshot-compare')return run(compareSnapshots);if(action.startsWith('folder:'))return runFolderWhenIdle(()=>folderCommand(action.slice(7)));document.querySelectorAll('.menu[open]').forEach(el=>el.open=false);if(action.startsWith('new:'))return runWhenIdle(()=>newSession(action.slice(4)));if(action.startsWith('filter:'))return setFilter(action.slice(7));if(action==='compare-parent-folders')return runWhenIdle(compareParentFolders);if(action==='clear-session')return runWhenIdle(clearSession);if(action==='close-session')return requestTabClose(activeId);if(action==='close-other-sessions')return requestCloseOtherTabs(activeId);const operations={'open-workspace':openWorkspace,'save-workspace':saveWorkspace,'open-session':openSession,'save-session':()=>saveSession(),'save-session-as':()=>saveSession(true),'lock-session':()=>changeSessionLock(true),'unlock-session':()=>changeSessionLock(false),'open-a':()=>openSide('a'),'open-b':()=>openSide('b'),'save-a':()=>saveText('a'),'save-b':()=>saveText('b'),'save-server-a':()=>saveRemoteText('a'),'save-server-b':()=>saveRemoteText('b'),reload,swap,undo:undoMerge,redo:redoMerge,previous:()=>jump(-1),next:()=>jump(1)};if(action==='copy-right')return merge('a');if(action==='copy-left')return merge('b');if(operations[action])return ['open-a','open-b'].includes(action)?runWhenIdle(operations[action]):run(operations[action]);}
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>setFilter(b.dataset.filter));document.querySelectorAll('.menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)document.querySelectorAll('.menu').forEach(other=>{if(other!==menu)other.open=false;});}));document.addEventListener('click',e=>{if(!e.target.closest('.menu'))document.querySelectorAll('.menu').forEach(m=>m.open=false);});
for(const side of ['a','b']){const cap=side.toUpperCase();$('open'+cap).onclick=()=>runWhenIdle(()=>openSide(side));$('save'+cap).onclick=()=>run(()=>saveText(side));$('file'+cap).onchange=e=>{const file=e.target.files[0];e.target.value='';run(()=>loadFile(side,file));};$('saveServer'+cap).onclick=()=>run(()=>saveRemoteText(side));$('clear'+cap).onclick=()=>{clearRemoteTextSource(side);invalidateArchiveEntrySide(side);setArea(side,'',defaultFormat());files[side]={name:'',path:''};sources[side]=null;undo=[];redo=[];invalidate();localEdits[side]=true;markDirty();scheduleCompare();};$('text'+cap).oninput=()=>{clearAlignment();undo=[];redo=[];invalidate();localEdits[side]=true;markDirty();scheduleCompare();};$('text'+cap).ondragover=e=>e.preventDefault();$('text'+cap).ondrop=e=>{e.preventDefault();const dropped=[...e.dataTransfer.files];if(dropped.length!==1){notify('Drop one file on the left or right side.',true);return;}runWhenIdle(()=>loadFile(side,dropped[0]));};}
$('showMinor').onchange=()=>{markDirty();applyFilter();};$('alignLines').onclick=openAlignment;for(const id of ['ignoreWhitespace','ignoreCase','ignoreBlankLines','showMovedBlocks','syntaxAlignment','whitespaceScope','textProfile'])$(id).onchange=()=>{markDirty();invalidate();scheduleCompare(!$('comparisonView').hidden);};$('previous').onclick=()=>jump(-1);$('next').onclick=()=>jump(1);$('mergeToA').onclick=()=>merge('b');$('mergeToB').onclick=()=>merge('a');$('undoMerge').onclick=undoMerge;$('redoMerge').onclick=redoMerge;$('swap').onclick=()=>run(swap);$('reload').onclick=()=>run(reload);for(const [id,other] of [['diffLeft','diffRight'],['diffRight','diffLeft']])$(id).onscroll=()=>{if($(other).scrollTop!==$(id).scrollTop)$(other).scrollTop=$(id).scrollTop;cancelAnimationFrame(frame);frame=requestAnimationFrame(renderRows);};window.addEventListener('resize',()=>{if(result)applyFilter();});
for(const [value,label]of FOLDER_FILTERS){const option=document.createElement('option');option.value=value;option.textContent=label[0].toUpperCase()+label.slice(1);$('folderStatusFilter').append(option);}$('folderStatusFilter').onchange=()=>setFilter($('folderStatusFilter').value||'all');
$('sessionLock').onclick=()=>runWhenIdle(()=>changeSessionLock(!sessionLocked));
$('sessionName').oninput=()=>markDirty();$('folderDirection').onchange=()=>markDirty();$('folderSyncMode').onchange=()=>{refreshSyncControls();markDirty();};for(const id of ['folderInclude','folderExclude','folderSearch'])$(id).oninput=()=>{folderTable();markDirty();};$('folderSelectRule').onchange=()=>{const rule=$('folderSelectRule').value;if(rule)applySelectionRule(rule);$('folderSelectRule').value='';};$('previewPlan').onclick=()=>runFolderWhenIdle(previewPlan);$('cancelPlan').onclick=()=>{if(folderTransferTask){void cancelActiveFolderTransfer();return;}if(plan?.remoteTransfer)void desktop.cancelFolderTransfer(activeId,plan.id).catch(error=>notify(error.message,true));$('planDialog').close();plan=null;};
$('planDialog').addEventListener('cancel',event=>{if(folderTransferTask){event.preventDefault();void cancelActiveFolderTransfer();}else if(plan?.remoteTransfer){void desktop.cancelFolderTransfer(activeId,plan.id).catch(error=>notify(error.message,true));plan=null;}});
function showTransferOutcome(outcome){
 const items=outcome.items||[],failed=outcome.failed||outcome.finalVerificationError||items.some(item=>['failed','unknown','verification-failed'].includes(item.status));
 const operationLabel=outcome.mode==='delete'?'Delete':outcome.mode==='rename'?'Rename':'Transfer';$('planTitle').textContent=operationLabel+(failed?' stopped':outcome.cancelled?' cancelled':' complete');
 const completed=items.filter(item=>item.status==='completed'),copied=completed.filter(item=>!item.action||item.action==='copy').length,created=completed.filter(item=>item.action==='create-directory').length,finalized=completed.filter(item=>item.action==='finalize-directory').length;
 const renamed=completed.filter(item=>item.action==='rename').length;const summary=outcome.mode==='delete'?[completed.filter(item=>item.action==='delete').length+' deleted']:outcome.mode==='rename'?[renamed+' renamed']:[copied+' copied'];if(created)summary.push(created+' folder'+(created===1?'':'s')+' created');if(finalized)summary.push(finalized+' folder metadata step'+(finalized===1?'':'s')+' completed');summary.push((outcome.skipped||0)+' skipped');
 const unattempted=items.filter(item=>item.status==='unattempted').length;if(unattempted)summary.push(unattempted+' not attempted');
 const errors=[outcome.error,outcome.finalVerificationError].filter(Boolean).map(error=>String(error.message||error));
 $('planDescription').textContent=summary.join(' · ')+[...new Set(errors)].map(error=>'\n'+error).join('')+(outcome.backupPath?'\nRecovery copies: '+outcome.backupPath:'')+(outcome.manifestPath?'\nRecovery record: '+outcome.manifestPath:'')+(outcome.recoveryWarning?'\n'+outcome.recoveryWarning:'');
 const fragment=document.createDocumentFragment();
 for(const item of items){
  const row=document.createElement('div');row.className='transfer-outcome';row.dataset.status=item.status||'unattempted';row.dataset.action=item.action||'copy';
  const notes=[];
  if(item.status!=='completed'){
   if(item.deleted===true)notes.push('deleted; verification incomplete');else if(item.deleted===null)notes.push('deletion outcome uncertain — refresh before retrying');
   if(item.renamed===true)notes.push('renamed; verification incomplete');else if(item.renamed===null)notes.push('rename outcome uncertain — refresh before retrying');
   if(item.published)notes.push('file published; verification incomplete');
   if(item.created===true)notes.push('folder created');else if(item.created===null)notes.push('folder creation uncertain');
   if(item.metadataApplied)notes.push('metadata applied; verification incomplete');else if(item.metadataMayHaveChanged||item.metadataSubmitted&&!item.acknowledged)notes.push('metadata may have changed');
  }
  for(const warning of [item.error,item.cleanupWarning,item.metadataWarning])if(warning)notes.push(String(warning));
  row.textContent=(item.status||'unattempted').replaceAll('-',' ')+' · '+(item.action?transferActionLabel(item.action)+' · ':'')+transferPath(item)+(notes.length?' — '+notes.join(' · '):'');fragment.append(row);
 }
 $('planOperations').replaceChildren(fragment);$('applyPlan').hidden=true;$('applyPlan').disabled=true;$('cancelPlan').textContent='Close';$('cancelPlan').disabled=false;
}
$('applyPlan').onclick=()=>run(async()=>{
 const reviewed=plan;if(!reviewed)return;let cancelled=false,remoteResult=null;
 const captured=folderOperationHistory.capture($('sessionName').value,$('planDescription').textContent+'\nLeft: '+(folders.a?.path||'Not selected')+'\nRight: '+(folders.b?.path||'Not selected'),reviewed);
 const task=reviewed.remoteTransfer?{sessionId:activeId,planId:reviewed.id,phase:'execute'}:null;
 if(task){folderTransferTask=task;$('applyPlan').disabled=true;$('cancelPlan').textContent='Stop';expansionControls();}
 try{
  const outcome=await desktop.executeFolders(reviewed.id);folderOperationHistory.record(captured,outcome);
  if(outcome.cancelled&&!outcome.items){cancelled=true;return;}
  if(outcome.remoteTransfer){remoteResult=outcome;if(outcome.remappedContexts)remapRenamedTabs(outcome.remappedContexts);showTransferOutcome(outcome);plan=null;}
  else{$('planDialog').close();notify(`Applied ${outcome.completed} operations.${outcome.retainedDirectories?' Kept '+outcome.retainedDirectories+' nonempty folders.':''}${outcome.backupPath?' Backup: '+outcome.backupPath:''}`);}
 }catch(error){$('planDialog').close();folderOperationHistory.record(captured,null,error);throw error;}
 finally{
  if(folderTransferTask===task)folderTransferTask=null;expansionControls();$('cancelPlan').disabled=false;
  if(cancelled){$('cancelPlan').textContent='Cancel';$('applyPlan').disabled=!reviewed.operations.length;}
  if(!cancelled){folderRootEpoch++;folderTreeRevision=null;try{await scan();if(reviewed.mode==='rename'&&remoteResult?.items?.some(item=>item.action==='rename'&&item.status==='completed')){const renamed=folderRows.find(row=>folderRowPath(row,reviewed.side)===reviewed.operations[0].targetPath);if(renamed)selectFolderRow(reviewed.side,renamed);markDirty();snapshot();}}catch(error){if(!remoteResult)throw error;notify('Transfer results are shown. Refresh or reconnect the folders to compare again. '+error.message,true);}}
 }
});
$('cancelDiscard').onclick=()=>finishGuard(false);$('discardSession').onclick=()=>finishGuard(true);$('saveBeforeContinue').onclick=async()=>{try{if(await saveSession())finishGuard(true);}catch(e){notify(e.message,true);}};$('unsavedDialog').addEventListener('cancel',e=>{e.preventDefault();finishGuard(false);});
$('sessionFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)run(()=>lockedWorkspaceInput(async()=>{snapshot();const previous=activeId,prior=tabs.get(previous);try{if(file.size>25*1024*1024)throw Error('Session is too large.');await restore(JSON.parse(await file.text()),file.name);snapshot();}catch(error){await rollbackWorkspace(previous,prior,error);}}));};
$('sample').onclick=async()=>{archiveEntryLink=null;refreshArchiveEntryActions();if(!activeId)await newSession();document.querySelectorAll('.menu').forEach(m=>m.open=false);files={a:{name:'settings.left.json',path:''},b:{name:'settings.right.json',path:''}};$('textA').value='{\n  "name": "Further Compare",\n  "version": "1.0",\n  "theme": "light",\n  "features": [\n    "text-compare"\n  ],\n  "private": true\n}\n';$('textB').value='{\n  "name": "Further Compare",\n  "version": "2.0",\n  "theme": "sage",\n  "features": [\n    "text-compare",\n    "folder-merge",\n    "folder-sync"\n  ],\n  "private": true\n}\n';setArea('a',$('textA').value,defaultFormat());setArea('b',$('textB').value,defaultFormat());sources={a:null,b:null};undo=[];redo=[];invalidate();setType('text-compare');compute();};
$('exportReport').onclick=()=>{if(type==='folder-merge3'){document.querySelectorAll('.menu').forEach(m=>m.open=false);threeWayEditor.exportReport();return;}document.querySelectorAll('.menu').forEach(m=>m.open=false);if(isFolder())folderReport.open();else if(result){const raw=texts(),a=normalizeText(raw.a).split('\n'),b=normalizeText(raw.b).split('\n');download(JSON.stringify({left:files.a.name,right:files.b.name,...(['a','b'].some(side=>files[side].documentProjection)?{documentProjections:Object.fromEntries(['a','b'].filter(side=>files[side].documentProjection).map(side=>[side,files[side].documentProjection]))}:{}),textFormats:Object.fromEntries(Object.entries(textFormats).map(([side,{encoding,bom,lineEnding}])=>[side,{encoding,bom,lineEnding}])),textProfile:$('textProfile').value,textProfileMappings:structuredClone(textProfileMappings),...(hasTextGrammar(textGrammar)?{textGrammar:structuredClone(textGrammar)}:{}),resolvedTextProfile:result.resolvedTextProfile||'plain',textProfileRulesVersion:result.textProfileRulesVersion,textGrammarVersion:result.textGrammarVersion,grammarFallbacks:result.grammarFallbacks,syntaxAlignmentEnabled:$('syntaxAlignment').checked,syntaxAlignment:result.syntaxAlignment,ignoreWhitespace:$('ignoreWhitespace').checked,ignoreCase:$('ignoreCase').checked,whitespaceScope:$('whitespaceScope').value,...(ignoredTextPatterns.length?{ignoredTextPatterns:structuredClone(ignoredTextPatterns)}:{}),...($('ignoreBlankLines').checked?{ignoreBlankLines:true}:{}),ignoredLineCount:result.ignoredLineCount||0,minorDifferences:result.rows.filter(row=>row.minor).map(row=>({leftLine:row.ai==null?null:row.ai+1,rightLine:row.bi==null?null:row.bi+1,left:row.a,right:row.b})),changes:result.hunks.map(h=>({...h,left:a.slice(h.aStart,h.aStart+h.aCount),right:b.slice(h.bStart,h.bStart+h.bCount)}))},null,2),'comparison.json','application/json');}};
if(!desktop)document.querySelectorAll('[data-native]').forEach(el=>{el.disabled=true;el.title='Available in the desktop app';});else{document.querySelector('.app-brand').href='#';document.querySelector('.app-brand').onclick=e=>e.preventDefault();desktop.onMenuAction(action=>{if(action==='edit:undo'||action==='edit:redo'||!document.querySelector('dialog[open]'))command(action);});}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&!e.altKey){const key=e.key.toLowerCase(),action=key==='z'?(e.shiftKey?'redo':'undo'):key==='y'?'redo':null;if(action&&(desktop||comparisonHistoryContext()&&(action==='undo'?undo:redo).length)){e.preventDefault();standardHistory(action);return;}}if(!desktop&&(e.metaKey||e.ctrlKey)){if(e.key==='Enter'){e.preventDefault();compute();}else if(e.key.toLowerCase()==='s'){e.preventDefault();command(e.shiftKey?'save-session-as':'save-session');}else if(e.key.toLowerCase()==='o'){e.preventDefault();command(e.altKey?(e.shiftKey?'open-b':'open-a'):'open-session');}}if(e.key==='Escape'){if(!document.querySelector('dialog[open]'))liveTextDiff.clearSelection();$('notice').hidden=true;document.querySelectorAll('.menu').forEach(m=>m.open=false);}});
window.addEventListener('beforeunload',e=>{if((dirty||[...tabs.values()].some(t=>t.dirty))&&!window.__fcAllowClose){e.preventDefault();e.returnValue='';}});
$('newTab').onclick=()=>requestTabSwitch(null);
if($('alignFolderPair'))$('alignFolderPair').onclick=()=>runFolderWhenIdle(alignSelectedFolders);if($('clearFolderAlignment'))$('clearFolderAlignment').onclick=()=>runFolderWhenIdle(clearAlignedFolders);
$('comparePair').onclick=()=>runFolderWhenIdle(compareSelectedPair);$('backToFolder').onclick=()=>runWhenIdle(backToFolder);$('folderViewMode').onchange=()=>run(()=>setFolderView($('folderViewMode').value));$('folderSort').onchange=()=>setFolderSort($('folderSort').value);$('folderSortOrder').onclick=()=>{folderViewState.descending=!folderViewState.descending;folderTable();markDirty();};for(const button of document.querySelectorAll('[data-folder-sort]'))button.onclick=()=>setFolderSort(button.dataset.folderSort,true);
$('folderUp').onclick=()=>runFolderWhenIdle(()=>collapseSubtree());$('folderExpandAll').onclick=()=>startExpansion();$('folderStop').onclick=()=>stopExpansion('Comparison stopped',true);
for(const side of ['a','b']){const cap=side.toUpperCase();$('copy'+cap).onclick=()=>runFolderWhenIdle(()=>folderAction('copy',side));$('delete'+cap).onclick=()=>runFolderWhenIdle(()=>folderAction('delete',side));}
if(!desktop){document.body.classList.add('web-app');$('clipboardTools').hidden=true;}
if(desktop?.platform==='darwin')document.body.classList.add('native-mac');
const folderRefreshSchedule=createFolderRefreshSchedule();
setInterval(()=>{
 const key=desktop&&activeId&&isFolder()?JSON.stringify([activeId,folderRootEpoch,folderViewState.mode]):null;
 const blocked=disconnectedFolders()||!folders.a&&!folders.b||operation||document.hidden||pendingGuard||expansionTask||folderCompareBusy||Boolean(document.querySelector('dialog[open]'))||['recursive','filename'].includes(folderViewState.mode);
 if(folderRefreshSchedule.due(key,folderViewState.refreshIntervalMs,blocked))run(()=>scan(true)).finally(()=>folderRefreshSchedule.complete(key));
},250);
let diskPollBusy=false;
setInterval(()=>{
 if(diskPollBusy||!desktop||!activeId||isAdvanced()||isFolder()||operation||document.hidden||pendingGuard||$('planDialog').open)return;
 const session=activeId;diskPollBusy=true;
 void(async()=>{
  const changed=await desktop.checkChanges();
  if(activeId!==session||operation||!Object.values(changed).some(Boolean))return;
  await run(async()=>{let updated=false;for(const side of ['a','b'])if(changed[side]&&files[side].path){
   if(localEdits[side]){if(!changeWarned){notify('A file changed on disk. Your edits are preserved; use Reload to review the disk version.');changeWarned=true;}continue;}
   const data=await desktop.reloadText(side);if(activeId!==session)return;
   if(data&&!localEdits[side]){setArea(side,data.content,data.format);updated=true;}
  }if(updated){undo=[];redo=[];invalidate();markDirty();compute(true,!$('comparisonView').hidden);}});
 })().catch(error=>{if(activeId===session)notify(error.message,true);}).finally(()=>{diskPollBusy=false;});
},1500);
const displaySettings=createDisplaySettings({host:$('displaySettings'),notify,captureFocus:origin=>{
 const container=origin?.closest('#folderRowsA,#folderRowsB');if(!isFolder()||!container)return null;
 const id=activeId,side=container.id==='folderRowsA'?'a':'b',roots=[folders.a?.path,folders.b?.path],row=origin.closest('.folder-entry'),rowId=row?.dataset.id,rowPath=row?.dataset.path;
 // Lazy comparisons can replace rows while the modal is open. Resolve the same
 // real entry again, but never restore a captured row into another folder session.
 return ()=>{if(!isFolder()||activeId!==id||roots[0]!==folders.a?.path||roots[1]!==folders.b?.path)return;
  const current=$('folderRows'+side.toUpperCase()),target=row?[...current.children].find(el=>el.dataset.id===rowId&&el.dataset.path===rowPath&&!el.classList.contains('missing')):current;
  if(target)target.focus({preventScroll:true});else current.focus({preventScroll:true});
 };
}});
const folderColumns=createFolderColumns($('folderWorkspace'));
const folderOperationHistory=createFolderOperationHistory({download,desktop});
const folderAttributesDialog=desktop?createFolderAttributesDialog({desktop,notify,readContext:side=>{side=side||folderFocus.side;if(!isFolder()||!activeId)throw Error('Open a folder comparison first.');return {id:activeId,side,ids:[...sideSelection[side]],revision:folderTreeRevision,roots:{a:folders.a?.path||'',b:folders.b?.path||''}};},onApplied:async()=>{folderRootEpoch++;folderTreeRevision=null;stopExpansion();await run(scan);},recordAttempt:(preview,outcome,error)=>{const captured=folderOperationHistory.capture($('sessionName').value,'Change attributes · '+preview.root+'\nSet mask: '+(preview.changes?.setMask||0).toString(preview.platform==='win32'?16:8)+' · Clear mask: '+(preview.changes?.clearMask||0).toString(preview.platform==='win32'?16:8),{operations:preview.entries.map(entry=>({action:'attributes',path:entry.path}))});folderOperationHistory.record(captured,outcome?{...outcome,completed:outcome.changed}:null,error);}}):null;

const folderPatchDialog=desktop?createFolderPatchDialog({desktop,notify,readContext:()=>{if(!activeId||!isFolder())throw Error('Open a folder comparison first.');return {id:activeId,side:folderFocus.side,roots:{a:folders.a?.path||'',b:folders.b?.path||''}};},onApplied:async outcome=>{if(outcome?.remappedContexts)remapRenamedTabs(outcome.remappedContexts);folderRootEpoch++;folderTreeRevision=null;stopExpansion();await run(scan);},recordAttempt:(preview,outcome,error)=>{const captured=folderOperationHistory.capture($('sessionName').value,'Apply folder patch · '+preview.root,preview);folderOperationHistory.record(captured,outcome,error);}}):null;
const folderQuickCompare=createFolderQuickCompare();
let remoteDialogContext=null;
const sftpConnectionDialog=desktop?createSftpConnectionDialog({desktop,notify,isCurrent:({sessionId})=>activeId===sessionId&&isFolder()&&remoteDialogContext?.epoch===viewEpoch}):null;
if(desktop)for(const side of ['a','b']){
 const button=document.createElement('button');button.id='folderRemote'+side.toUpperCase();button.className='icon-button';button.type='button';button.textContent='Remote';button.title='Connect '+(side==='a'?'left':'right')+' SFTP folder';button.setAttribute('aria-label',button.title);
 $('folderHistory'+side.toUpperCase()).after(button);
 button.onclick=async()=>{
  if(operation||remoteDialogContext||!activeId||!isFolder())return;
  stopExpansion();const context={sessionId:activeId,side,epoch:viewEpoch};remoteDialogContext=context;
  try{const selected=await sftpConnectionDialog.open({...context,endpoint:folders[side]});if(selected&&activeId===context.sessionId&&viewEpoch===context.epoch)await run(()=>applyFolderRoot(side,selected));}
  catch(error){notify(error.message,true);}finally{remoteDialogContext=null;}
 };
}
const batchDialog=createBatchDialog(desktop);
document.addEventListener('display-settings-change',()=>{if(!result)return;const top=$('diffLeft').scrollTop,left=$('diffLeft').scrollLeft,right=$('diffRight').scrollLeft;applyFilter();setDiffScroll(top);$('diffLeft').scrollLeft=left;$('diffRight').scrollLeft=right;renderRows();});
setType('text-compare',false);metadata();folderTable();showInputs();markDirty(false);const initialWorkspace=showWelcome();

for(const side of ['a','b']){const cap=side.toUpperCase();for(const id of ['encoding','bom','eol','normalizeLegacy'])$(id+cap).onchange=()=>run(()=>changeTextFormat(side));$('readEncoding'+cap).onchange=()=>{markDirty();snapshot();};$('reopenEncoding'+cap).onclick=()=>run(()=>reopenEncoding(side));$('pdfOrder'+cap).onchange=()=>{markDirty();snapshot();};$('reextractPdf'+cap).onclick=()=>run(()=>reextractPdf(side));$('docxScope'+cap).onchange=()=>{markDirty();snapshot();};$('reextractDocx'+cap).onclick=()=>run(()=>reextractDocx(side));$('odtScope'+cap).onchange=()=>{markDirty();snapshot();};$('reextractOdt'+cap).onclick=()=>run(()=>reextractOdt(side));$('docScope'+cap).onchange=()=>{markDirty();snapshot();};$('reextractDoc'+cap).onclick=()=>run(()=>reextractDoc(side));}
Promise.resolve(initialWorkspace).catch(error=>notify(error.message,true)).finally(()=>{document.body.inert=false;document.body.setAttribute('aria-busy','false');});

for(const side of ['a','b']){const cap=side.toUpperCase();for(const action of ['Back','Forward','Parent'])$('folder'+action+cap).onclick=()=>run(()=>navigateFolder(side,action.toLowerCase()));$('folderHistory'+cap).onchange=event=>{const value=event.target.value;event.target.value='';if(value)run(()=>navigateFolder(side,'path',value));};$('path'+cap).onfocus=()=>{if(isFolder())folderFocus.side=side;};$('path'+cap).onkeydown=event=>{if(!isFolder())return;if(event.key==='Enter'){event.preventDefault();const value=event.target.value;run(()=>navigateFolder(side,'path',value));}else if(event.key==='Escape'){event.preventDefault();event.target.value=folders[side]?.path||'';event.target.blur();}};}

$('folderAutoRefresh').onchange=()=>{
 const id=activeId,intent={value:Number($('folderAutoRefresh').value)};pendingFolderRefresh.set(id,intent);
 runWhenIdle(()=>{if(isFolder()&&pendingFolderRefresh.get(id)===intent)setFolderAutoRefresh(intent.value);}).finally(()=>{if(pendingFolderRefresh.get(id)===intent)pendingFolderRefresh.delete(id);if(activeId===id)folderViewControls();});
};
$('folderDisableUnixChecks').onclick=()=>runWhenIdle(()=>setFolderRules(folderRules.mode,folderRules.timeToleranceMs/1000,folderRules,{compareFilename:folderRules.compareFilename}));
for(const key of folderMetadataKeys)$('folder'+key[0].toUpperCase()+key.slice(1)).onchange=()=>{
 const id=activeId,intent={value:$('folder'+key[0].toUpperCase()+key.slice(1)).checked};
 if(!pendingFolderMetadata.has(id))pendingFolderMetadata.set(id,new Map());pendingFolderMetadata.get(id).set(key,intent);
 // Keep the latest checkbox intent visible while an earlier scan finishes.
 // Read the other rules only when this queued change runs, avoiding stale snapshots.
 runWhenIdle(async()=>{if(!isFolder()||pendingFolderMetadata.get(id)?.get(key)!==intent)return;await setFolderRules(folderRules.mode,folderRules.timeToleranceMs/1000,folderRules,{...folderRules,[key]:intent.value});}).finally(()=>{
  const pending=pendingFolderMetadata.get(id);if(pending?.get(key)===intent)pending.delete(key);if(pending?.size===0)pendingFolderMetadata.delete(id);if(activeId===id)folderRuleControls();
 });
};
for(const key of folderNameKeys)folderNameControl(key).onchange=()=>{
 const id=activeId,intent={value:folderNameControl(key).checked};if(!pendingFolderNames.has(id))pendingFolderNames.set(id,new Map());pendingFolderNames.get(id).set(key,intent);
 runWhenIdle(async()=>{if(activeId!==id||!isFolder()||pendingFolderNames.get(id)?.get(key)!==intent)return;await setFolderNameRules({...folderNameRules,[key]:intent.value});}).finally(()=>{const pending=pendingFolderNames.get(id);if(pending?.get(key)===intent)pending.delete(key);if(!pending?.size)pendingFolderNames.delete(id);if(activeId===id)folderNameControls();});
};
for(const key of folderTimestampKeys)$('folder'+key[0].toUpperCase()+key.slice(1)).onchange=()=>{
 const id=activeId,intent={value:$('folder'+key[0].toUpperCase()+key.slice(1)).checked};
 if(!pendingFolderTimestamp.has(id))pendingFolderTimestamp.set(id,new Map());pendingFolderTimestamp.get(id).set(key,intent);
 runWhenIdle(async()=>{if(!isFolder()||pendingFolderTimestamp.get(id)?.get(key)!==intent)return;await setFolderRules(folderRules.mode,folderRules.timeToleranceMs/1000,folderRules,folderRules,{...folderRules,[key]:intent.value});}).finally(()=>{
  const pending=pendingFolderTimestamp.get(id);if(pending?.get(key)===intent)pending.delete(key);if(pending?.size===0)pendingFolderTimestamp.delete(id);if(activeId===id)folderRuleControls();
 });
};
async function editIgnoredText(folder=false){
 const id=activeId;document.querySelectorAll('dialog[open]').forEach(dialog=>{if(['textOptionsDialog','folderOptionsDialog'].includes(dialog.id))dialog.close();});
 const raw=folder?{a:'',b:''}:texts(),patterns=await ignoredTextDialog.open(folder?folderRules.ignoredTextPatterns||[]:ignoredTextPatterns,[normalizeText(raw.a),normalizeText(raw.b)]);
 if(patterns===null||activeId!==id)return;
 if(folder){await runWhenIdle(async()=>{if(activeId!==id||!isFolder())return;folderRules={...folderRules};if(patterns.length)folderRules.ignoredTextPatterns=patterns;else delete folderRules.ignoredTextPatterns;await setFolderRules();});}
 else{ignoredTextPatterns=patterns;markDirty();invalidate();compute(true);}
}
async function editTextProfileMappings(folder=false){
 const id=activeId;document.querySelectorAll('dialog[open]').forEach(dialog=>{if(['textOptionsDialog','folderOptionsDialog'].includes(dialog.id))dialog.close();});
 const previewRow=folder?(folderRows.find(row=>selection.has(row.id)&&(row.kindA==='file'||row.kindB==='file'))||folderRows.find(row=>row.kindA==='file'||row.kindB==='file')):null;
 const names=folder?[previewRow?.pathA||'',previewRow?.pathB||'']:['a','b'].map(side=>files[side].path||files[side].name||'');
 const mappings=await textProfileMappingsDialog.open(folder?folderRules.textProfileMappings||[]:textProfileMappings,names,folder?folderRules.textProfile||'plain':$('textProfile').value,folder);
 if(mappings===null||activeId!==id)return;
 if(folder)await runWhenIdle(async()=>{if(activeId!==id||!isFolder())return;folderRules={...folderRules,textProfileMappings:mappings};await setFolderRules();});
 else{textProfileMappings=mappings;markDirty();invalidate();compute(true,false);}
}
async function editTextGrammar(folder=false){
 const id=activeId;document.querySelectorAll('dialog[open]').forEach(dialog=>{if(['textOptionsDialog','folderOptionsDialog'].includes(dialog.id))dialog.close();});
 const raw=folder?{a:'',b:''}:texts(),names=folder?['','']:['a','b'].map(side=>files[side].path||files[side].name||'');
 const grammar=await textGrammarDialog.open({grammar:folder?folderRules.textGrammar:textGrammar,texts:[raw.a,raw.b],names,textProfile:folder?folderRules.textProfile||'plain':$('textProfile').value,textProfileMappings:folder?folderRules.textProfileMappings||[]:textProfileMappings,folder});
 if(grammar===null||activeId!==id)return;
 if(folder)await runWhenIdle(async()=>{if(activeId!==id||!isFolder())return;folderRules={...folderRules};if(hasTextGrammar(grammar))folderRules.textGrammar=grammar;else delete folderRules.textGrammar;await setFolderRules();});
 else{textGrammar=grammar;markDirty();invalidate();compute(true,false);}
}
$('textGrammar').onclick=()=>editTextGrammar().catch(error=>notify(error.message,true));
$('folderTextGrammar').onclick=()=>editTextGrammar(true).catch(error=>notify(error.message,true));
$('textProfileMappings').onclick=()=>editTextProfileMappings().catch(error=>notify(error.message,true));
$('folderTextProfileMappings').onclick=()=>editTextProfileMappings(true).catch(error=>notify(error.message,true));
$('textIgnoredText').onclick=()=>editIgnoredText().catch(error=>notify(error.message,true));
$('folderIgnoredText').onclick=()=>editIgnoredText(true).catch(error=>notify(error.message,true));
$('folderIgnoreBlankLines').onchange=()=>{
 const id=activeId,intent={value:$('folderIgnoreBlankLines').checked};pendingFolderBlankLines.set(id,intent);
 runWhenIdle(async()=>{if(activeId!==id||!isFolder()||pendingFolderBlankLines.get(id)!==intent)return;await setFolderRules(folderRules.mode,folderRules.timeToleranceMs/1000,folderRules,folderRules,folderRules,folderRules.textWhitespaceScope||'horizontal',intent.value);}).finally(()=>{if(pendingFolderBlankLines.get(id)===intent)pendingFolderBlankLines.delete(id);if(activeId===id)folderRuleControls();});
};
$('folderTextWhitespaceScope').onchange=()=>{
 const id=activeId,intent={value:$('folderTextWhitespaceScope').value};pendingFolderWhitespace.set(id,intent);
 runWhenIdle(async()=>{if(activeId!==id||!isFolder()||pendingFolderWhitespace.get(id)!==intent)return;await setFolderRules(folderRules.mode,folderRules.timeToleranceMs/1000,folderRules,folderRules,folderRules,intent.value);}).finally(()=>{if(pendingFolderWhitespace.get(id)===intent)pendingFolderWhitespace.delete(id);if(activeId===id)folderRuleControls();});
};
$('folderTextEncoding').onclick=()=>run(editFolderEncoding);$('folderCompareMode').onchange=()=>run(()=>setFolderRules($('folderCompareMode').value));$('folderTimeTolerance').onchange=()=>run(()=>setFolderRules());

function selectedTextReportRows(){const rows=folderRows.filter(row=>selection.has(row.id));return rows.length&&rows.length<=20&&rows.every(row=>!row.alignmentConflict&&row.status!=='conflict'&&[row.kindA,row.kindB].every(kind=>!kind||kind==='file'))?rows:null;}
const fileContentReport=createFileContentReportDialog({download,notify});
async function reportFolderTextFiles(){
 const rows=selectedTextReportRows();if(!rows)throw Error('Select up to 20 text file rows, without folders or type conflicts.');
 stopExpansion();const context=folderActionContext(),rules={...folderRules},id=activeId,focus={...folderFocus};
 const current=()=>context===folderActionContext()&&JSON.stringify(rules)===JSON.stringify(folderRules);
 const pendingStopSerial=folderStopSerial;while(folderCompareBusy)await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingStopSerial!==folderStopSerial){const stopped=Error('Comparison stopped.');stopped.code='ABORT_ERR';throw stopped;}
 if(!current())throw Error('Folder view changed. Generate the report again.');
 const payload=await desktop.readFolderTextReport(rows.map(row=>row.id),folderTreeRevision,folderEncodings(rules));
 if(!current())throw Error('Folder view changed. Generate the report again.');
 await fileContentReport.open(payload,rules,()=>{if(id===activeId&&isFolder())focusFolderRow(focus.side,focus.path);},current);
}
function reportSelectedFolders(){if(!selection.size)throw Error('Select entries to report.');const id=activeId,focus={...folderFocus};folderReport.open('selected',()=>{if(id===activeId&&isFolder())focusFolderRow(focus.side,focus.path);});}
const folderReport=createFolderReportDialog({readSnapshot:()=>({left:folders.a,right:folders.b,rules:folderRules,scan:folderScanInfo,matchingMode:folderViewState.mode==='filename'?'filename':'path',nameRules:{...folderNameRules},alignment:folderAlignmentPairs.map(pair=>({...pair})),filters:{...folderFilterOptions(),refreshIntervalMs:validateRefreshInterval(folderViewState.refreshIntervalMs)},visible:visibleFolders(),loaded:ignoredFolderRows(),selected:ignoredFolderRows().filter(row=>selection.has(row.id))}),download,notify});$('folderReport').onclick=()=>folderReport.open();

async function refreshShellState(){if(!desktop?.shellState)return;let state;try{state=await desktop.shellState();}catch(error){$('shellTools').hidden=false;$('shellLeftName').textContent='Selection unreadable — Clear to reset';$('shellClearLeft').disabled=false;throw error;}$('shellTools').hidden=false;$('shellLeftName').textContent=state.left?state.left.name+(state.available?'':' (unavailable)'):'None selected';$('shellLeftName').title=state.left?.path||'';$('shellClearLeft').disabled=!state.left;}
async function acceptShellRequest(){let scanAfter=false;await lockedWorkspaceInput(async()=>{snapshot();const previous=activeId,prior=tabs.get(previous);let request;try{request=await desktop.takeShellRequest();}catch(error){await refreshShellState().catch(()=>{});throw error;}if(!request)return;if(request.action==='cancelled'){await refreshShellState();return;}if(request.action==='clear-left'){await refreshShellState();notify('File manager left selection cleared.');return;}try{stopExpansion();await newSessionUnlocked(request.mode,request.id);if(request.mode==='folder-compare'){folders=request.folders;await applyFolderRoot('a',request.folders.a,{load:false});scanAfter=true;}else if(request.mode==='text-compare'){for(const side of ['a','b'])if(request[side])setLoaded(side,request[side]);compute();}else{const state={inputs:{a:request.a,b:request.b,base:null},options:currentEditor().getState().options};if(dedicatedEditors[request.mode])await dedicatedEditors[request.mode].setState(state);else await dataEditor.setType(request.mode,state);}$('sessionName').value=request.b?request.a.name+' ↔ '+request.b.name:request.a.name;markDirty();snapshot();await refreshShellState();if(request.action==='set-left')notify(request.mode==='folder-compare'?'Left folder selected. Right-click another folder and choose Compare with Left.':'Left file selected. Right-click another file and choose Compare with Left.');}catch(error){await rollbackWorkspace(previous,prior,error,request.id);}});if(scanAfter)await scan();}
if(desktop?.takeShellRequest){$('shellRememberLeft').onclick=()=>run(async()=>{await desktop.setShellLeft('a');await refreshShellState();notify('Current left file selected for file manager comparisons.');});$('shellClearLeft').onclick=()=>run(async()=>{await desktop.clearShellLeft();await refreshShellState();});run(async()=>{await refreshShellState();await acceptShellRequest();});let checkingShell=false;setInterval(()=>{if(checkingShell||operation||pendingGuard||document.querySelector('dialog[open]'))return;checkingShell=true;void desktop.hasPendingShellRequest().then(pending=>{if(pending&&!operation&&!pendingGuard&&!document.querySelector('dialog[open]'))return run(acceptShellRequest);}).catch(error=>notify(error.message,true)).finally(()=>{checkingShell=false;});},800);}

const shellSetup=createShellSetup({desktop,notify});

const externalEditorSettings=createExternalEditorSettings({desktop,notify});
const settingsTransfer=createSettingsTransfer({desktop,displaySettings,folderColumns,notify});
const keyboardShortcuts=createKeyboardShortcuts({desktop,notify});
if(desktop?.setShortcutCapture){let last=false;new MutationObserver(()=>{const active=!!document.querySelector('dialog[open]');if(active!==last){last=active;desktop.setShortcutCapture(active).catch(error=>notify(error.message,true));}}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open'],childList:true});}
const sessionDefaults=createSessionDefaults({desktop,getSessionData:()=>activeId?sessionData():null,notify});

const folderModifiedDialog=createFolderModifiedDialog();
const folderPropertiesDialog=createFolderPropertiesDialog();

// Resolve the native File while the drop event is live, then use normal queued navigation.
for(const side of ['a','b']){
 const cap=side.toUpperCase(),targets=[$('path'+cap).closest('.path-field'),$('folderRows'+cap).closest('.folder-pane')];
 for(const target of targets){
  const accepts=event=>desktop&&isFolder()&&Array.from(event.dataTransfer?.types||[]).includes('Files');
  target.addEventListener('dragenter',event=>{if(!accepts(event))return;event.preventDefault();target.classList.add('folder-drop-target');});
  target.addEventListener('dragover',event=>{if(!accepts(event))return;event.preventDefault();event.dataTransfer.dropEffect='copy';target.classList.add('folder-drop-target');});
  target.addEventListener('dragleave',event=>{if(!target.contains(event.relatedTarget))target.classList.remove('folder-drop-target');});
  target.addEventListener('drop',event=>{
   target.classList.remove('folder-drop-target');if(!accepts(event))return;event.preventDefault();event.stopPropagation();
   try{
    const files=event.dataTransfer.files;if(files.length!==1)throw Error('Drop one folder on the left or right side.');
    const path=desktop.droppedFilePath(files[0]);if(!path)throw Error('Drop a folder from your file manager.');
    runWhenIdle(()=>navigateFolder(side,'path',path));
   }catch(error){notify(error.message,true);}
  });
 }
}
document.addEventListener('dragend',()=>document.querySelectorAll('.folder-drop-target').forEach(target=>target.classList.remove('folder-drop-target')));

const remoteTextMenu=createContextMenu('remoteTextContext','Remote text actions');
for(const side of ['a','b']){const cap=side.toUpperCase();$('path'+cap).parentElement.addEventListener('contextmenu',event=>{if(isFolder()||isAdvanced()||!remoteTextSources.get(activeId)?.[side])return;event.preventDefault();const id=activeId,source=remoteTextSources.get(id)[side],valid=()=>activeId===id&&remoteTextSources.get(id)?.[side]===source;remoteTextMenu.open([{label:'Save to server…',disabled:operation,validate:valid,action:()=>run(()=>saveRemoteText(side))},{label:'Save local copy…',disabled:operation,validate:valid,action:()=>run(()=>saveText(side))}],event.clientX,event.clientY,()=>event.target.focus?.());});}


$('folderTextProfile').onchange=()=>{const id=activeId,profile=validateTextProfile($('folderTextProfile').value);runWhenIdle(async()=>{if(activeId!==id||!isFolder())return;folderRules={...folderRules,textProfile:profile};await setFolderRules();}).catch(error=>notify(error.message,true));};
