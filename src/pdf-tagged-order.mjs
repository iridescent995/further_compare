// PDF.js page-local structure projection; never infer missing semantic ownership.
export const PDF_TAGGED_EXCLUSIONS=Object.freeze([
 'Page layout, fonts, colors and graphics',
 'Images and scanned text without an existing text layer (no OCR)',
 'Annotations, attachments, forms and scripts',
 'Page-local structure order of extracted text; paragraph-edge whitespace normalized',
 'Artifacts preserved in a labelled per-page tail in original drawing order',
 'Accessibility replacement text, empty structural cells, cell spans and original layout are not reconstructed'
]);
const error=(code,message)=>Object.assign(new Error(message),{code});
export function createPdfTaggedPage({budget={events:0,nodes:0},maxOutputBytes=8*1024*1024,signal}={}){
 const groups=new Map(),stack=[],artifacts=[];let rawBytes=0,finished=false;
 const encoder=new TextEncoder();
 const check=()=>{if(signal?.aborted)throw error('DOCUMENT_CANCELLED','PDF extraction cancelled.');};
 const fail=message=>{throw error('DOCUMENT_ORDER_UNSUPPORTED','Tagged PDF: '+message);};
 const limit=message=>{throw error('DOCUMENT_LIMIT','Tagged PDF: '+message);};
 function add(items){
  if(finished)fail('page already finished.');
  for(const item of items){check();if(++budget.events>1000000)limit('marked-content event limit exceeded.');
   if(item.type==='beginMarkedContent'||item.type==='beginMarkedContentProps'){
    if(stack.length>=128)limit('marked-content nesting limit exceeded.');
    const id=item.id;if(id!==undefined&&id!==null&&(typeof id!=='string'||id.length>256))fail('invalid marked-content identity.');
    if(id){if(groups.has(id)||stack.some(x=>x.id))fail('duplicate or nested marked-content identity.');groups.set(id,[]);}
    const artifact=item.tag==='Artifact';if(artifact&&id||artifact&&stack.some(x=>x.id)||id&&stack.some(x=>x.artifact))fail('mixed artifact and semantic ownership.');
    // Nested artifact wrappers share their outer owner's buffer: retain each glyph once.
    const outer=stack.find(x=>x.artifact);stack.push({id,artifact:artifact?(outer?.artifact||[]):null,ownsArtifact:artifact&&!outer});continue;
   }
   if(item.type==='endMarkedContent'){if(!stack.length)fail('unbalanced marked-content markers.');const closed=stack.pop();if(closed.ownsArtifact)artifacts.push(closed.artifact);continue;}
   if(typeof item.str!=='string')fail('unknown text-content event.');
   const text=item.str+(item.hasEOL?'\n':'');rawBytes+=encoder.encode(text).length;if(rawBytes>maxOutputBytes)limit('extracted text exceeds output budget.');
   const artifact=stack.find(x=>x.artifact),owner=stack.find(x=>x.id);
   if(artifact)artifact.artifact.push(text);else if(owner)groups.get(owner.id).push(text);else if(item.str.trim())fail('text has no structural or artifact owner.');
  }
 }
 function finish(tree){
  check();if(finished)fail('page already finished.');finished=true;
  if(stack.length)fail('unbalanced marked-content markers.');if(!tree){if([...groups.values()].some(content=>content.some(text=>text.trim())))fail('page has no structure tree.');tree={role:'Root',children:[]};}
  const seen=new Set(),parts=[];let bytes=0,pending='',atBoundary=true;
  function append(text){if(!text)return;const length=encoder.encode(text).length;if(bytes+length>maxOutputBytes)limit('rendered text exceeds output budget.');bytes+=length;parts.push(text);}
  function write(text){if(atBoundary)text=text.replace(/^\s+/u,'');if(!text)return;const match=/\s+$/u.exec(text);const trailing=match?match[0]:'';const body=trailing?text.slice(0,-trailing.length):text;if(body){append(pending);pending='';append(body);atBoundary=false;}pending+=trailing;}
  function boundary(separator){pending='';if(parts.length||separator==='\t')append(separator);atBoundary=true;}
  function visit(node,depth){check();if(++budget.nodes>200000)limit('structure node limit exceeded.');if(depth>128)limit('structure nesting limit exceeded.');
   if(!node||typeof node!=='object')fail('invalid structure node.');
   if(node.type){if(node.type!=='content')fail('object references cannot be mapped to extracted text.');if(typeof node.id!=='string'||seen.has(node.id))fail('duplicate or invalid structure reference.');seen.add(node.id);const content=groups.get(node.id);if(!content)fail('structure references missing marked content.');for(const text of content)write(text);return;}
   if(!Array.isArray(node.children)||typeof node.role!=='string')fail('invalid structure children.');
   const separator=node.role==='TR'?'\t':node.role==='LI'?' ':['P','Span','H','H1','H2','H3','H4','H5','H6','Lbl','Link','Quote','Em','Strong','Code'].includes(node.role)?'':'\n';
   for(let i=0;i<node.children.length;i++){if(i&&separator)boundary(separator);visit(node.children[i],depth+1);}
  }
  visit(tree,0);
  for(const[id,content]of groups)if(!seen.has(id)&&content.some(text=>text.trim()))fail('marked text is missing from the structure tree.');
  let labelled=false;
  for(const content of artifacts){if(!content.some(text=>text.trim()))continue;if(!labelled){boundary('\n');write('[Page artifacts — original drawing order]');labelled=true;}boundary('\n');for(const text of content)write(text);}
  return parts.join('');
 }
 return {add,finish};
}
