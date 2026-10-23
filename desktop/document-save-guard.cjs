'use strict';
const nativeFS=require('node:fs/promises');
const path=require('node:path');
function assertDocumentTargetSnapshot(destination,target,sources=[]){
  if(/\.(doc|docx|pdf|rtf|odt)$/i.test(destination))throw Error('Export document text to a .txt file. PDF, RTF, ODT and Word documents cannot be overwritten with extracted text.');
  for(const source of sources){
    if(path.resolve(destination)===path.resolve(source.path))throw Error('Choose a separate text file; the source document must remain unchanged.');
    if(target&&source.revision?.split(':').slice(0,2).join(':')===`${target.dev}:${target.ino}`)throw Error('Choose a separate text file; this destination is the source document.');
  }
}
async function assertTextExportTarget(destination,sources=[],fs=nativeFS){
  if(/\.(doc|docx|pdf|rtf|odt)$/i.test(destination))throw Error('Export document text to a .txt file. PDF, RTF, ODT and Word documents cannot be overwritten with extracted text.');
  let target;
  try{target=await fs.stat(destination,{bigint:true});}catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
  for(const source of sources){
    if(path.resolve(destination)===path.resolve(source.path))throw Error('Choose a separate text file; the source document must remain unchanged.');
    // Retain native opened identity even if another application renames the
    // document after extraction, or the save picker chooses a hard-link alias.
    if(target&&source.revision?.split(':').slice(0,2).join(':')===`${target.dev}:${target.ino}`)throw Error('Choose a separate text file; this destination is the source document.');
  }
}
module.exports={assertTextExportTarget,assertDocumentTargetSnapshot};
