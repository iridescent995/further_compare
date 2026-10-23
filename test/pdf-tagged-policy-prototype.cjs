'use strict';
// Qualification only. No production policy/API is introduced by this experiment.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{spawnSync}=require('node:child_process');
function candidate(tree,items){
 if(!tree)throw Error('Missing structure');
 const groups=new Map(),artifacts=[],stack=[];let chars=0,nodes=0;
 for(let item of items){
  if(++nodes>1000000)throw Error('Item budget');
  if(item.type==='beginMarkedContent'||item.type==='beginMarkedContentProps'){
   if(stack.length>128)throw Error('Depth budget');
   if(item.id){if(groups.has(item.id)||stack.some(x=>x.id))throw Error('Ambiguous marked identity');groups.set(item.id,[]);}
   if(item.tag==='Artifact')item={...item,artifact:[]};
   stack.push(item);continue;
  }
  if(item.type==='endMarkedContent'){if(!stack.length)throw Error('Unbalanced markers');const done=stack.pop();if(done.artifact?.length)artifacts.push(done.artifact);continue;}
  if(typeof item.str!=='string')throw Error('Unknown item');
  if((chars+=item.str.length)>8*1024*1024)throw Error('Text budget');
  const artifact=stack.find(x=>x.artifact),owner=stack.find(x=>x.id);
  if(artifact){if(owner)throw Error('Mixed semantic/artifact ownership');artifact.artifact.push(item);}
  else if(owner)groups.get(owner.id).push(item);
  else if(item.str.trim())throw Error('Uncovered text');
 }
 if(stack.length)throw Error('Unbalanced markers');
 function text(items){
  const copy=items.slice();
  // Experimental heuristic, NOT proof of synthetic origin. See authored-space evidence.
  while(copy.length&&!copy[0].str.trim()&&copy[0].height===0)copy.shift();
  while(copy.length&&!copy.at(-1).str.trim()&&copy.at(-1).height===0)copy.pop();
  return copy.map(x=>x.str+(x.hasEOL?'\n':'')).join('').replace(/\n+$/,'');
 }
 const seen=new Set();nodes=0;
 function visit(node,depth){
  if(++nodes>200000||depth>128)throw Error('Structure budget');
  if(node.type){if(node.type!=='content')throw Error('Object unsupported');if(seen.has(node.id))throw Error('Repeated reference');seen.add(node.id);if(!groups.has(node.id))throw Error('Missing referenced text');return text(groups.get(node.id));}
  if(!Array.isArray(node.children))throw Error('Invalid structure');
  const parts=node.children.map(x=>visit(x,depth+1));
  const separator=node.role==='TR'?'\t':node.role==='LI'?' ':['Span','P','H','H1','H2','H3','H4','H5','H6','Lbl'].includes(node.role)?'':'\n';
  const length=parts.reduce((n,x)=>n+x.length,Math.max(0,parts.length-1)*separator.length);if(length>8*1024*1024)throw Error('Output budget');
  return parts.join(separator);
 }
 const content=visit(tree,0);for(const[id,values]of groups)if(!seen.has(id)&&values.some(x=>x.str.trim()))throw Error('Unreferenced text');
 const artifactText=artifacts.map(text).filter(x=>x.trim());
 return {content,artifactText,combined:content+(artifactText.length?'\n[Page artifacts — original drawing order]\n'+artifactText.join('\n'):'')};
}
async function run(){
 const pdfjs=await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href),root=path.join(__dirname,'fixtures/pdf-tagged-independent');
 const expected=JSON.parse(fs.readFileSync(path.join(root,'expected.json'))),results=[];
 for(const name of ['baseline','drawing-row-major','table-list','artifact-footer-valid','artifact-text','authored-edge-spaces','authored-standalone-spaces','reused-form-mcid']){
  const task=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(path.join(root,name+'.pdf'))),verbosity:0,isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,useWasm:false});
  try{const doc=await task.promise,page=await doc.getPage(1),tree=await page.getStructTree(),{items}=await page.getTextContent({includeMarkedContent:true});
   if(['artifact-text','reused-form-mcid'].includes(name)){assert.throws(()=>candidate(tree,items),name==='artifact-text'?/Missing/:/Ambiguous/);results.push({name,rejected:true});continue;}
   const result=candidate(tree,items);
   if(['baseline','drawing-row-major'].includes(name))assert.equal(result.content,expected.logicalParagraphs.join('\n'));
   if(name==='table-list'){const x=expected.tableList;assert.equal(result.content,[x.heading,...x.rows.map(row=>row.join('\t')),...x.listItems.map((s,i)=>x.listLabels[i]+' '+s),x.final].join('\n'));}
   if(name==='artifact-footer-valid'){assert.equal(result.content,expected.validArtifactLogicalParagraphs.join('\n'));assert.deepEqual(result.artifactText,['Final paragraph.']);assert(result.combined.includes('Final paragraph.'));}
   if(name.startsWith('authored-'))assert.equal(items.some(x=>typeof x.str==='string'&&(x.str.startsWith(' ')||x.str.endsWith(' '))),false,'PDF.js has already discarded authored edge spaces');
   if(name.startsWith('authored-'))results.push({name,spaceItems:items.filter(x=>typeof x.str==='string'&&(x.str.startsWith(' ')||x.str.endsWith(' '))).map(x=>({str:x.str,height:x.height,width:x.width})),result});
   else results.push({name,result});
  }finally{await task.destroy();}
 }
 console.log(JSON.stringify({testOnly:true,results},null,2));
}
if(require.main===module){if(process.argv.includes('--child'))run().catch(e=>{console.error(e);process.exitCode=1;});else{const c=spawnSync(process.execPath,[__filename,'--child'],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,killSignal:'SIGKILL'});process.stdout.write(c.stdout||'');process.stderr.write(c.stderr||'');process.exitCode=c.status===0&&!c.error?0:1;}}
module.exports={candidate};
