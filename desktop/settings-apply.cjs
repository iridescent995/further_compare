'use strict';
const {validateSettings}=require('./external-editor.cjs');
const {validateDefaultProfiles}=require('./session-defaults.cjs');
const {validateShortcuts}=require('./keyboard-shortcuts.cjs');
function record(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(key=>!keys.includes(key)))throw Error('Invalid preference application.');}
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';return JSON.stringify(value);}
function profilesKey(value){return canonical([...value].sort((a,b)=>a.type.localeCompare(b.type)));}
// The caller serializes application changes. Undo completed writes in reverse
// order, using expected state so recovery never overwrites newer preferences.
async function applyTransferredPreferences(value,expected,{externalEditor,sessionDefaults,shortcutStore,shortcutCatalog,platform=process.platform}){
 record(value,['externalEditor','sessionDefaults','keyboardShortcuts']);record(expected,['externalEditor','sessionDefaults','keyboardShortcuts']);
 const hasEditor=Object.hasOwn(value,'externalEditor'),hasDefaults=Object.hasOwn(value,'sessionDefaults'),hasShortcuts=Object.hasOwn(value,'keyboardShortcuts');
 const editor=hasEditor?validateSettings(value.externalEditor,platform):null;
 const profiles=hasDefaults?validateDefaultProfiles(value.sessionDefaults):null;
 const shortcuts=hasShortcuts?validateShortcuts(value.keyboardShortcuts,shortcutCatalog,platform):null;
 const previousEditor=hasEditor?validateSettings(expected.externalEditor,platform):null;
 const previousProfiles=hasDefaults?validateDefaultProfiles(expected.sessionDefaults):null;
 const previousShortcuts=hasShortcuts?validateShortcuts(expected.keyboardShortcuts,shortcutCatalog,platform):null;
 if(hasEditor&&canonical(await externalEditor.settings())!==canonical(previousEditor))throw Error('External editor preferences changed. Review the settings again.');
 if(hasDefaults&&profilesKey(await sessionDefaults.all())!==profilesKey(previousProfiles))throw Error('Session defaults changed. Review the settings again.');
 if(hasShortcuts&&canonical(await shortcutStore.get())!==canonical(previousShortcuts))throw Error('Keyboard shortcuts changed. Review the settings again.');
 const rollback=[];
 try{
  if(hasShortcuts){await shortcutStore.save(shortcuts,previousShortcuts);rollback.push(['Keyboard shortcuts',()=>shortcutStore.save(previousShortcuts,shortcuts)]);}
  if(hasDefaults){await sessionDefaults.replaceAll(profiles,previousProfiles);rollback.push(['Session defaults',()=>sessionDefaults.replaceAll(previousProfiles,profiles)]);}
  if(hasEditor)await externalEditor.save(editor);
 }catch(error){
  const failures=[];for(const [label,restore]of rollback.reverse())try{await restore();}catch(restoreError){failures.push(label+' could not be restored: '+restoreError.message);}
  if(failures.length)throw Error(error.message+' '+failures.join(' ')+' Review current preferences before trying again.');
  throw error;
 }
 return {applied:true};
}
module.exports={applyTransferredPreferences};
