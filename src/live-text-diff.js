import {createContextMenu} from './context-menu.js';
import {inlineDiff} from './inline-diff.cjs';
// Decorations stay behind the native editors: selection, IME, undo and find remain native.
export function createLiveTextDiff({areas,onHunk=()=>{},onLinePick=()=>{},onCopy=()=>{}}){
 let result=null,options={},frame=0,scrollSource=null;const panes={},inlineCache=new WeakMap(),moveMenu=createContextMenu('movedTextContext','Moved text navigation');let moveTarget=null;
 const make=(tag,cls)=>{const el=document.createElement(tag);el.className=cls;return el;};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;const source=scrollSource;scrollSource=null;if(source)syncScroll(source);for(const pane of Object.values(panes))paint(pane);});};
 for(const [side,area]of Object.entries(areas)){
  const parent=area.parentElement;parent.classList.add('live-text-editor');area.classList.add('live-text-area');
  const layer=make('div','live-text-decoration'),gutter=make('div','live-text-gutter'),measure=make('div','live-text-measure');layer.setAttribute('aria-hidden','true');gutter.setAttribute('aria-label',`${side==='a'?'Left':'Right'} line numbers`);measure.setAttribute('aria-hidden','true');parent.append(layer,gutter,measure);
  const bands=make('div','live-text-lines'),numbers=make('div','live-text-lines');for(const node of [bands,numbers])Object.assign(node.style,{position:'absolute',left:'0',top:'0',width:'100%'});layer.append(bands);gutter.append(numbers);
  const pane=panes[side]={side,area,parent,layer,gutter,measure,bands,numbers,key:null,text:null,lines:[],offsets:[],starts:[],rows:new Map(),moves:new Map(),pairedIndexes:[],visible:new Map(),arrows:new Map(),selected:new Set(),anchor:null,revision:0};
  area.addEventListener('scroll',()=>{if(pane.syncedTop===area.scrollTop){pane.syncedTop=null;pane.lastScrollTop=area.scrollTop;}else scrollSource=pane;schedule();},{passive:true});area.addEventListener('input',()=>{clearMoves();pane.key=null;pane.rows.clear();pane.pairedIndexes=[];pane.selected.clear();pane.anchor=null;pane.revision++;schedule();});
  const lineAt=offset=>{let low=0,high=pane.starts.length;while(low<high){const mid=(low+high)>>>1;if(pane.starts[mid]<=offset)low=mid+1;else high=mid;}return Math.max(0,low-1);};
  const pickSelection=()=>{layout(pane);pane.selected.clear();if(area.value!==''){const first=lineAt(area.selectionStart),last=lineAt(Math.max(area.selectionStart,area.selectionEnd-1));for(let i=first;i<=last;i++)pane.selected.add(i);pane.anchor=first;const row=pane.rows.get(first);if(Number.isInteger(row?.hunk))onHunk(row.hunk);}schedule();};
  area.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey){layout(pane);chooseLine(pane,lineAt(area.selectionStart),event);}else pickSelection();});
  area.addEventListener('keydown',event=>{if(event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.isComposing&&event.key.toLowerCase()==='m'){layout(pane);const pair=pane.moves.get(lineAt(area.selectionStart));if(pair){event.preventDefault();event.stopPropagation();revealMove(pane.side,pair);}}});
  area.addEventListener('keyup',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(event.key))pickSelection();});
  area.addEventListener('select',()=>{if(document.activeElement===area&&area.selectionEnd>area.selectionStart)pickSelection();});

  new ResizeObserver(()=>{pane.key=null;schedule();}).observe(area);
  new MutationObserver(()=>{pane.key=null;schedule();}).observe(area,{attributes:true,attributeFilter:['style','wrap']});
 }
 function clearMoves(){moveMenu.close();moveTarget=null;for(const pane of Object.values(panes)){pane.moves.clear();pane.parent.classList.remove('has-moved-text');pane.key=null;for(const cached of pane.visible.values()){cached.move?.remove();cached.move=null;cached.number.oncontextmenu=null;cached.band.classList.remove('moved-target');}}}
 function moveLabel(side,pair){return `${side==='a'?'Moved to right':'Moved from left'} line ${pair[side==='a'?'bStart':'aStart']+1} · ${pair.lineCount} lines`;}
 function moveContext(event,pane,pair){event.preventDefault();event.stopPropagation();const current=result;moveMenu.open([{label:moveLabel(pane.side,pair),validate:()=>result===current&&pane.moves.get(pair[pane.side+'Start'])===pair,action:()=>revealMove(pane.side,pair)}],event.clientX,event.clientY,()=>pane.area.focus({preventScroll:true}));}
 function revealMove(side,pair){
  const source=panes[side],target=panes[side==='a'?'b':'a'];if(source.moves.get(pair[side+'Start'])!==pair||!layout(target))return;
  const start=pair[target.side+'Start'],end=start+pair.lineCount;moveTarget={side:target.side,start,end};scrollSource=null;
  target.area.focus({preventScroll:true});target.area.setSelectionRange(target.starts[start],end<target.starts.length?target.starts[end]:target.area.value.length);
  target.selected=new Set(Array.from({length:pair.lineCount},(_,index)=>start+index));target.anchor=start;
  target.area.scrollTop=Math.max(0,target.offsets[start]+target.paddingTop-target.area.clientHeight/3);target.syncedTop=target.area.scrollTop;target.lastScrollTop=target.area.scrollTop;scrollSource=null;schedule();
 }
 function syncScroll(pane){
  const top=pane.area.scrollTop;if(pane.lastScrollTop===top)return;pane.lastScrollTop=top;
  if(pane.syncedTop===top){pane.syncedTop=null;return;}pane.syncedTop=null;
  const peer=panes[pane.side==='a'?'b':'a'];if(!peer||!layout(pane)||!layout(peer))return;
  const offset=Math.max(0,top-pane.paddingTop);let low=0,high=pane.lines.length;while(low<high){const mid=(low+high)>>>1;if(pane.offsets[mid+1]<=offset)low=mid+1;else high=mid;}
  const index=Math.min(low,pane.lines.length-1),row=pane.rows.get(index);let target=row?.[peer.side==='a'?'ai':'bi'];
  if(!Number.isInteger(target)&&row?.minor){
   // Find the nearest paired physical line without rescanning a long blank gap.
   const paired=pane.pairedIndexes;let start=0,end=paired.length;
   while(start<end){const middle=(start+end)>>>1;if(paired[middle]<index)start=middle+1;else end=middle;}
   const before=paired[start-1],after=paired[start];
   const nearest=before!==undefined&&(after===undefined||index-before<=after-index)?before:after;
   if(nearest!==undefined)target=pane.rows.get(nearest)?.[peer.side==='a'?'ai':'bi'];
  }
  if(!Number.isInteger(target))target=Number.isInteger(row?.hunk)?result?.hunks[row.hunk]?.[peer.side+'Start']:index;
  target=Math.max(0,Math.min(peer.lines.length-1,target??index));
  const fraction=(offset-pane.offsets[index])/(pane.offsets[index+1]-pane.offsets[index]);
  peer.area.scrollTop=top===0?0:peer.paddingTop+peer.offsets[target]+fraction*(peer.offsets[target+1]-peer.offsets[target]);peer.syncedTop=peer.area.scrollTop;
 }
 function layout(pane){
  const {area,measure}=pane;if(!area.clientWidth)return false;if(pane.key!==null)return true;const style=getComputedStyle(area),wrapped=style.whiteSpace==='pre-wrap'||area.wrap==='soft';
  const width=Math.max(1,area.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
  const key=[width,style.font,style.lineHeight,style.letterSpacing,style.tabSize,wrapped].join('|');
  if(pane.key===key&&pane.text===area.value)return true;
  pane.key=key;pane.text=area.value;pane.lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;pane.paddingTop=parseFloat(style.paddingTop)||0;pane.paddingLeft=parseFloat(style.paddingLeft)||0;
  pane.lines=area.value.split('\n');pane.starts=[];pane.offsets=[0];let chars=0;
  Object.assign(measure.style,{font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,tabSize:style.tabSize,width:width+'px',whiteSpace:wrapped?'pre-wrap':'pre',overflowWrap:style.overflowWrap,wordBreak:style.wordBreak});
  // Most source lines never wrap. Batch the remaining measurements into one layout pass.
  const canvas=layout.canvas??=(document.createElement('canvas'));const context=canvas.getContext('2d');context.font=style.font;const candidates=[],heights=new Array(pane.lines.length).fill(pane.lineHeight),fragment=document.createDocumentFragment();
  if(wrapped)for(let index=0;index<pane.lines.length;index++){
   const line=pane.lines[index];if(line.includes('\t')||context.measureText(line).width+Math.max(0,parseFloat(style.letterSpacing)||0)*line.length>width-2){const row=make('div','');row.textContent=line||'\u200b';fragment.append(row);candidates.push([index,row]);}
  }
  measure.replaceChildren(fragment);for(const [index,row]of candidates)heights[index]=Math.max(pane.lineHeight,row.getBoundingClientRect().height);measure.replaceChildren();
  for(let index=0;index<pane.lines.length;index++){pane.starts.push(chars);chars+=pane.lines[index].length+1;pane.offsets.push(pane.offsets[index]+heights[index]);}return true;
 }
 function chooseLine(pane,index,event){
  const {area}=pane;area.focus({preventScroll:true});
  if(event.shiftKey){const anchor=pane.anchor??index;if(!event.ctrlKey&&!event.metaKey)pane.selected.clear();for(let line=Math.min(anchor,index);line<=Math.max(anchor,index);line++)pane.selected.add(line);}
  else if(event.ctrlKey||event.metaKey){if(pane.selected.has(index))pane.selected.delete(index);else pane.selected.add(index);pane.anchor=index;}
  else{pane.selected.clear();if(area.value!=='')pane.selected.add(index);pane.anchor=index;area.focus({preventScroll:true});area.setSelectionRange(pane.starts[index],pane.starts[index]);}
  const row=pane.rows.get(index);if(Number.isInteger(row?.hunk))onHunk(row.hunk);if(!event.shiftKey&&!event.ctrlKey&&!event.metaKey)onLinePick(pane.side,index);schedule();
 }
 function paint(pane){
  if(!layout(pane)||!pane.area.getClientRects().length)return;const {area,parent,layer,gutter}=pane,box=area.getBoundingClientRect(),base=parent.getBoundingClientRect();
  for(const node of [layer,gutter])Object.assign(node.style,{left:box.left-base.left+parent.scrollLeft+'px',top:box.top-base.top+parent.scrollTop+'px',height:area.clientHeight+'px'});layer.style.width=area.clientWidth+'px';
  let low=0,high=pane.lines.length;const scroll=area.scrollTop-pane.paddingTop;while(low<high){const mid=(low+high)>>>1;if(pane.offsets[mid+1]<scroll)low=mid+1;else high=mid;}low=Math.max(0,low-2);
  const transform='translateY('+(-scroll)+'px)';pane.bands.style.transform=transform;pane.numbers.style.transform=transform;
  const visible=new Set();
  for(let index=low;index<pane.lines.length&&pane.offsets[index]<scroll+area.clientHeight+pane.lineHeight*2;index++){
   visible.add(index);const row=pane.rows.get(index),minor=row?.minor&&options.showMinor!==false,changed=row&&row.type!=='equal';
   const matches=options.filter==='same'?!changed&&!minor:['diff','diffs','different','context'].includes(options.filter)?changed||minor:true;
   const kind=changed?(row.type==='changed'?'changed':pane.side==='a'?'removed':'added'):minor?'minor':'equal';
   const top=pane.offsets[index],height=pane.offsets[index+1]-top;
   let cached=pane.visible.get(index);
   if(!cached){const band=make('div','live-text-band'),number=make('button','live-text-number');number.type='button';number.tabIndex=-1;number.textContent=String(index+1);number.dataset.line=String(index+1);number.onclick=event=>chooseLine(pane,index,event);pane.bands.append(band);pane.numbers.append(number);cached={band,number,marks:[],key:null};pane.visible.set(index,cached);}
   const {band,number}=cached,current=row?.hunk===options.selectedHunk?' current':'',dim=matches?'':' deemphasized';band.className='live-text-band '+kind+current+dim+(pane.selected.has(index)?' line-selected':'')+(moveTarget?.side===pane.side&&index>=moveTarget.start&&index<moveTarget.end?' moved-target':'');Object.assign(band.style,{top:top+'px',height:height+'px'});band.dataset.line=String(index+1);
   const picked=pane.selected.has(index);number.className='live-text-number '+kind+current+dim+(row?.anchor?' alignment-anchor':'')+(options.isPicked?.(pane.side,index)?' alignment-picked':'')+(picked?' line-selected':'');number.setAttribute('aria-pressed',String(picked));number.title=`Line ${index+1}${changed?' · Difference':minor?' · Minor difference':''}`;number.setAttribute('aria-label',number.title);Object.assign(number.style,{top:top+'px',height:pane.lineHeight+'px',lineHeight:pane.lineHeight+'px'});
   const move=pane.moves.get(index);number.oncontextmenu=move?event=>moveContext(event,pane,move):null;
   if(move){number.title+=' · '+moveLabel(pane.side,move);number.setAttribute('aria-label',number.title);}
   if(move&&index===move[pane.side+'Start']){if(!cached.move){cached.move=make('button','live-text-move');cached.move.type='button';cached.move.textContent='⇄';pane.numbers.append(cached.move);}const badge=cached.move;badge.dataset.line=String(index+1);badge.dataset.side=pane.side;badge.title=moveLabel(pane.side,move);badge.setAttribute('aria-label',badge.title);badge.onclick=()=>revealMove(pane.side,move);badge.oncontextmenu=event=>moveContext(event,pane,move);badge.onkeydown=event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){const rect=badge.getBoundingClientRect();moveContext({preventDefault:()=>event.preventDefault(),stopPropagation:()=>event.stopPropagation(),clientX:rect.left,clientY:rect.bottom},pane,move);}};Object.assign(badge.style,{top:top+'px',height:pane.lineHeight+'px'});}else{cached.move?.remove();cached.move=null;}
   const markKey=pane.revision+'|'+pane.key+'|'+!!minor;
   if(cached.key!==markKey){for(const mark of cached.marks)mark.node.remove();cached.marks=[];if((changed||minor)&&typeof row.a==='string'&&typeof row.b==='string')for(const rect of inlineRects(pane,row)){const node=make('div','live-text-inline');Object.assign(node.style,{top:top+rect.top+'px',width:rect.width+'px',height:rect.height+'px'});pane.bands.append(node);cached.marks.push({node,left:rect.left});}cached.key=markKey;}
   for(const mark of cached.marks){mark.node.className='live-text-inline'+dim;mark.node.style.left=mark.left+pane.paddingLeft-area.scrollLeft+'px';}
  }
  for(const [index,cached]of pane.visible)if(!visible.has(index)){cached.band.remove();cached.number.remove();cached.move?.remove();for(const mark of cached.marks)mark.node.remove();pane.visible.delete(index);}
  const arrows=new Set(),hunks=result?.hunks||[],selected=[...pane.selected].sort((a,b)=>a-b),selectionLine=selected[0];
  const arrowTop=index=>{const line=Math.min(pane.lines.length,hunks[index][pane.side+'Start']);return Math.min(pane.offsets[line]??0,Math.max(0,pane.offsets.at(-1)-pane.lineHeight));};
  const placements=[];
  if(selected.length&&hunks.length){
   // A selection has one copy action at its first line, never at the section header.
   const index=pane.rows.get(selectionLine)?.hunk??options.selectedHunk??0;
   placements.push({key:'selection',index,line:selectionLine,top:pane.offsets[selectionLine]});
  }else{
   let first=0,last=hunks.length;while(first<last){const middle=(first+last)>>>1;if(arrowTop(middle)<scroll-pane.lineHeight*3)first=middle+1;else last=middle;}
   for(let index=first;index<hunks.length;index++){const top=arrowTop(index);if(top>scroll+area.clientHeight+pane.lineHeight*3)break;placements.push({key:index,index,top});}
  }
  for(const {key,index,line,top}of placements){
   if(top<scroll-pane.lineHeight*3||top>scroll+area.clientHeight+pane.lineHeight*3)continue;
   arrows.add(key);let arrow=pane.arrows.get(key);if(!arrow){arrow=make('button','live-text-copy');arrow.type='button';arrow.dataset.side=pane.side;arrow.textContent=pane.side==='a'?'→':'←';pane.numbers.append(arrow);pane.arrows.set(key,arrow);}
   arrow.dataset.hunk=String(index);arrow.dataset.scope=selected.length?'selection':'section';if(line!==undefined)arrow.dataset.line=String(line+1);else delete arrow.dataset.line;
   arrow.onclick=event=>{event.preventDefault();event.stopPropagation();onCopy(pane.side,index,selected.length?selected:null);};
   const direction=pane.side==='a'?'right':'left';arrow.title=selected.length===1?`Copy line ${selectionLine+1} to ${direction}`:selected.length?`Copy ${selected.length} selected lines to ${direction}`:`Copy difference to ${direction}`;arrow.setAttribute('aria-label',arrow.title);Object.assign(arrow.style,{position:'absolute',top:top+'px',height:pane.lineHeight+'px'});
  }
  for(const [index,arrow]of pane.arrows)if(!arrows.has(index)){arrow.remove();pane.arrows.delete(index);}
 }
 function inlineRects(pane,row){
  if(row.a.length>2000||row.b.length>2000)return [];
  let cached=inlineCache.get(row);if(!cached){cached={spans:inlineDiff(row.a,row.b)};inlineCache.set(row,cached);}
  if(cached[pane.side]?.key===pane.key)return cached[pane.side].rects;
  const {measure}=pane,node=make('div',''),text=document.createTextNode(row[pane.side]);node.append(text);measure.append(node);const origin=node.getBoundingClientRect(),rects=[];let offset=0;
  for(const span of cached.spans[pane.side]){if(span.changed&&span.text.length){const range=document.createRange();range.setStart(text,offset);range.setEnd(text,offset+span.text.length);for(const rect of range.getClientRects())rects.push({left:rect.left-origin.left,top:rect.top-origin.top,width:rect.width,height:rect.height});}offset+=span.text.length;}
  node.remove();cached[pane.side]={key:pane.key,rects};return rects;
 }
 function update(next,settings={}){const changed=result!==next;if(changed)clearMoves();result=next;options=settings;if(changed)for(const pane of Object.values(panes)){pane.key=null;pane.revision++;pane.selected.clear();pane.anchor=null;pane.rows.clear();pane.pairedIndexes=[];for(const row of next?.rows||[]){const index=row[pane.side==='a'?'ai':'bi'];if(Number.isInteger(index)){pane.rows.set(index,row);if(Number.isInteger(row[pane.side==='a'?'bi':'ai']))pane.pairedIndexes.push(index);}}pane.pairedIndexes.sort((a,b)=>a-b);for(const pair of next?.movedBlocks?.pairs||[])for(let index=pair[pane.side+'Start'];index<pair[pane.side+'Start']+pair.lineCount;index++)pane.moves.set(index,pair);pane.parent.classList.toggle('has-moved-text',pane.moves.size>0);}schedule();}
 function revealHunk(index){const hunk=result?.hunks?.[index];if(!hunk)return;options={...options,selectedHunk:index};for(const pane of Object.values(panes)){if(!layout(pane))continue;const line=Math.min(pane.lines.length-1,hunk[pane.side+'Start']);pane.area.scrollTop=Math.max(0,pane.offsets[line]+pane.paddingTop-pane.area.clientHeight/3);}schedule();}
 document.addEventListener('display-settings-change',()=>{for(const pane of Object.values(panes))pane.key=null;schedule();});schedule();
 return {update,clearSelection(){for(const pane of Object.values(panes)){pane.selected.clear();pane.anchor=null;}schedule();},getSelection(side){return [...(panes[side]?.selected||[])].sort((a,b)=>a-b);},clear(){update(null,{});},revealHunk,refresh:schedule};
}
