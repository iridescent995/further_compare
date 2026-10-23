import {runRegexSearch} from './regex-worker-client.js';
const element=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const initial=()=>({side:'a',query:'',replacement:'',matchCase:false,regex:false,wrap:false,whitespace:false,bookmarks:{a:[],b:[]}});
export function createTextTools({host,areas,onEdit=()=>{},onBeforeEdit=()=>{},onCopyLines=()=>{},validateOutput=()=>{},notify=()=>{}}){
 let state=initial(),enabled=true,revision=0,countTimer,countJob,actionJob,lastZero=null;const originals={},mirrors={};host.classList.add('text-tools');
 const main=element('div','text-tools-row'),search=element('div','text-tools-row text-find-row'),status=element('output','text-tools-status');search.hidden=true;
 const more=element('dialog','text-tools-dialog'),moreHeader=element('div','text-tools-dialog-header'),moreBody=element('div','text-tools-dialog-body');more.setAttribute('aria-label','Text tools');
 const button=(label,action)=>{const node=element('button','text-tool-button',label);node.type='button';node.onclick=()=>{try{action();}catch(error){notify(error.message,true);}};return node;};
 const side=element('select');side.setAttribute('aria-label','Text tool side');for(const [value,label]of [['a','Left'],['b','Right']]){const option=element('option',null,label);option.value=value;side.append(option);}side.onchange=()=>{state.side=side.value;update();};main.append(side);
 const query=element('input');query.type='search';query.placeholder='Find literal text';query.setAttribute('aria-label','Find text');query.oninput=()=>{lastZero=null;state.query=query.value;update();};query.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();find(event.shiftKey?-1:1);}if(event.key==='Escape'){event.preventDefault();closeSearch();}};
 const replacement=element('input');replacement.placeholder='Replace with';replacement.setAttribute('aria-label','Replacement text');replacement.oninput=()=>{state.replacement=replacement.value;revision++;};
 const checkbox=(label,key)=>{const wrapper=element('label','text-tool-check'),input=element('input');input.type='checkbox';input.onchange=()=>{lastZero=null;state[key]=input.checked;update();};wrapper.append(input,document.createTextNode(label));return {wrapper,input};};
 const regex=checkbox('Regex','regex');regex.wrapper.title='Regular expressions; ^ and $ match line boundaries. Replacement supports $1 and named captures.';
 const matchCase=checkbox('Case','matchCase'),wrap=checkbox('Wrap','wrap'),whitespace=checkbox('Spaces','whitespace');
 const line=element('input');line.type='number';line.min='1';line.value='1';line.setAttribute('aria-label','Go to line');line.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();goLine(Number(line.value));}};
 const findToggle=button('Find',()=>search.hidden?openSearch():closeSearch());findToggle.setAttribute('aria-expanded','false');
 const moreToggle=button('More',()=>openMore());moreToggle.title='Go to line, bookmarks and copy selected lines';moreToggle.setAttribute('aria-haspopup','dialog');
 main.append(findToggle,wrap.wrapper,whitespace.wrapper,moreToggle);
 const closeMore=()=>more.close();moreHeader.append(element('strong',null,'Text tools'),button('Close',closeMore));
 const runMore=action=>()=>{more.close();action();};
 moreBody.append(element('span',null,'Go to line'),line,button('Go',runMore(()=>goLine(Number(line.value)))),button('Bookmark',runMore(toggleBookmark)),button('Previous mark',runMore(()=>jumpBookmark(-1))),button('Next mark',runMore(()=>jumpBookmark(1))),button('Copy lines',runMore(copyLines)));
 more.append(moreHeader,moreBody);more.addEventListener('close',()=>{if(enabled)active().focus();});
 line.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();more.close();goLine(Number(line.value));}};
 search.append(query,button('Previous',()=>find(-1)),button('Next',()=>find(1)),matchCase.wrapper,regex.wrapper,replacement,button('Replace',replaceCurrent),button('Replace all',replaceAll),status,button('Close find',closeSearch));host.replaceChildren(main,search,more);
 function openSearch(){search.hidden=false;findToggle.setAttribute('aria-expanded','true');query.focus();query.select();}
 function closeSearch(){search.hidden=true;findToggle.setAttribute('aria-expanded','false');active().focus();}
 function openMore(){if(!more.open)more.showModal();}

 const active=()=>areas[state.side];
 function literalPattern(){return new RegExp(state.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),state.matchCase?'g':'gi');}
 function matchStats(){const stats={count:0,first:null,last:null,next:null,previous:null};if(!state.query)return stats;const area=active(),pattern=literalPattern();let match;while((match=pattern.exec(area.value))!==null){const found={index:match.index,ordinal:++stats.count};stats.first??=found;stats.last=found;if(stats.next===null&&match.index>=area.selectionEnd)stats.next=found;if(match.index<area.selectionStart)stats.previous=found;}return stats;}
 function lineNumber(area=active()){return area.value.slice(0,area.selectionStart).split('\n').length;}
 function update(){
  revision++;clearTimeout(countTimer);countJob?.cancel();countJob=null;
  regex.input.checked=state.regex;query.placeholder=state.regex?'Find pattern':'Find literal text';side.value=state.side;query.value=state.query;replacement.value=state.replacement;matchCase.input.checked=state.matchCase;wrap.input.checked=state.wrap;whitespace.input.checked=state.whitespace;
  if(!state.regex){const count=matchStats().count;status.textContent=(state.query?count.toLocaleString()+' matches · ':'')+state.bookmarks[state.side].length+' bookmarks';}
  else if(!state.query||!enabled)status.textContent=state.bookmarks[state.side].length+' bookmarks';
  else{status.textContent='Searching…';const version=revision;countTimer=setTimeout(async()=>{const job=countJob=runRegexSearch({text:active().value,query:state.query,matchCase:state.matchCase});try{const result=await job.promise;if(version===revision)status.textContent=result.count.toLocaleString()+' matches · '+state.bookmarks[state.side].length+' bookmarks';}catch(error){if(version===revision)status.textContent=error.message;}finally{if(countJob===job)countJob=null;}},150);}
  for(const name of ['a','b']){const area=areas[name];area.wrap=state.wrap?'soft':'off';area.style.whiteSpace=state.wrap?'pre-wrap':'pre';area.style.overflowWrap=state.wrap?'break-word':'normal';paintWhitespace(name);}
 }
 function reveal(start,end=start){const area=active();area.focus();area.setSelectionRange(start,end);const style=getComputedStyle(area),height=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2,top=area.value.slice(0,start).split('\n').length-1;area.scrollTop=Math.max(0,top*height-area.clientHeight/3);line.value=String(top+1);paintWhitespace(state.side);}
 function find(direction){if(state.regex)return regexAction('scan',direction);if(!state.query){openSearch();return;}const found=matchStats();if(!found.count){status.textContent='No matches';return;}const target=direction>0?(found.next??found.first):(found.previous??found.last);reveal(target.index,target.index+state.query.length);status.textContent=`${target.ordinal} of ${found.count} matches`;}
 function edited(name){const total=areas[name].value.split('\n').length;state.bookmarks[name]=state.bookmarks[name].filter(number=>number<=total);onEdit(name);update();}
 function replaceCurrent(){if(state.regex)return regexAction('replace-current');if(!state.query)return;const area=active(),selected=area.value.slice(area.selectionStart,area.selectionEnd),same=state.matchCase?selected===state.query:selected.toLowerCase()===state.query.toLowerCase();if(!same){find(1);return;}const start=area.selectionStart;onBeforeEdit();area.setRangeText(state.replacement,start,area.selectionEnd,'end');edited(state.side);find(1);}
 function replaceAll(){if(state.regex)return regexAction('replace-all');if(!state.query)return;const area=active();let count=0;const output=area.value.replace(literalPattern(),()=>{count++;return state.replacement;});if(!count)return;onBeforeEdit();area.value=output;area.setSelectionRange(0,0);edited(state.side);status.textContent=`Replaced ${count.toLocaleString()} matches`;}
 async function regexAction(operation,direction=1){
  if(!enabled)return;if(!state.query){openSearch();return;}clearTimeout(countTimer);countJob?.cancel();countJob=null;actionJob?.cancel();
  const version=revision,area=active(),name=state.side,text=area.value,start=area.selectionStart,end=area.selectionEnd;
  const request={text,query:state.query,matchCase:state.matchCase,start,end,operation,replacement:state.replacement,skipZeroAt:lastZero?.area===area&&lastZero.text===text&&lastZero.query===state.query&&lastZero.index===start&&start===end?start:null};
  const job=actionJob=runRegexSearch(request);status.textContent='Searching…';
  const current=()=>enabled&&version===revision&&actionJob===job&&area===active()&&area.value===text&&area.selectionStart===start&&area.selectionEnd===end;
  try{const result=await job.promise;if(!current())return;
   if(operation!=='scan'&&result.output!==undefined&&(operation!=='replace-all'||result.count)){
    validateOutput(result.output);onBeforeEdit();area.value=result.output;const cursor=operation==='replace-current'?start+result.selected.replacement.length:0;area.setSelectionRange(cursor,cursor);lastZero=null;edited(name);status.textContent=operation==='replace-all'?`Replaced ${result.count.toLocaleString()} matches`:'Replaced match';return;
   }
   if(!result.count){status.textContent='No matches';return;}
   const target=direction>0?(result.next??result.first):(result.previous??result.last);reveal(target.index,target.index+target.length);lastZero=target.length===0?{area,text,query:state.query,index:target.index}:null;clearTimeout(countTimer);countJob?.cancel();countJob=null;status.textContent=`${target.ordinal} of ${result.count} matches`;
  }catch(error){if(current()){status.textContent=error.message;notify(error.message,true);}}finally{if(actionJob===job)actionJob=null;}
 }
 function goLine(number){const lines=active().value.split('\n'),target=Math.max(1,Math.min(lines.length,Math.floor(number)||1));let offset=0;for(let i=0;i<target-1;i++)offset+=lines[i].length+1;reveal(offset);}
 function toggleBookmark(){const number=lineNumber(),bookmarks=state.bookmarks[state.side],index=bookmarks.indexOf(number);if(index>=0)bookmarks.splice(index,1);else bookmarks.push(number);bookmarks.sort((a,b)=>a-b);update();status.textContent=`Line ${number} bookmark ${index>=0?'removed':'added'}`;}
 function jumpBookmark(direction){const marks=state.bookmarks[state.side];if(!marks.length){status.textContent='No bookmarks on this side';return;}const current=lineNumber();goLine(direction>0?(marks.find(number=>number>current)??marks[0]):([...marks].reverse().find(number=>number<current)??marks.at(-1)));}
 function lineRange(area){const text=area.value,start=area.selectionStart===0?0:text.lastIndexOf('\n',area.selectionStart-1)+1;let end=area.selectionEnd;if(end>area.selectionStart&&text[end-1]==='\n')return {start,end};const next=text.indexOf('\n',end);return {start,end:next<0?text.length:next+1};}
 function copyLines(){
  const source=areas[state.side],range=lineRange(source);
  const first=source.value.slice(0,range.start).split('\n').length-1;
  const end=Math.max(range.start,range.end-1),last=source.value.slice(0,end).split('\n').length-1;
  onCopyLines(state.side,Array.from({length:last-first+1},(_,index)=>first+index));
 }
 function paintWhitespace(name){const area=areas[name],mirror=mirrors[name];if(!mirror)return;mirror.hidden=!state.whitespace||!enabled||!area.getClientRects().length;if(mirror.hidden){area.style.color=originals[name].color;return;}const style=getComputedStyle(area),box=area.getBoundingClientRect(),parent=area.parentElement.getBoundingClientRect();area.style.color='transparent';area.style.caretColor=originals[name].computedColor;
  Object.assign(mirror.style,{left:box.left-parent.left+area.parentElement.scrollLeft+area.clientLeft+'px',top:box.top-parent.top+area.parentElement.scrollTop+area.clientTop+'px',width:area.clientWidth+'px',height:area.clientHeight+'px',font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing,padding:style.padding,whiteSpace:state.wrap?'pre-wrap':'pre',overflowWrap:state.wrap?'break-word':'normal',color:originals[name].computedColor});
  let column=0,text='';for(const char of area.value){if(char==='\n'){text+='\n';column=0;}else if(char==='\t'){const count=4-column%4;text+='→'+' '.repeat(count-1);column+=count;}else{text+=char===' '?'·':char;column++;}}mirror.firstChild.textContent=text+'\n';mirror.scrollTop=area.scrollTop;mirror.scrollLeft=area.scrollLeft;
 }
 for(const name of ['a','b']){const area=areas[name],style=getComputedStyle(area);originals[name]={color:area.style.color,computedColor:style.color};if(getComputedStyle(area.parentElement).position==='static')area.parentElement.style.position='relative';const mirror=element('div','text-whitespace-mirror');mirror.setAttribute('aria-hidden','true');mirror.append(element('div'));mirror.hidden=true;area.after(mirror);mirrors[name]=mirror;area.style.tabSize='4';area.addEventListener('focus',()=>{state.side=name;side.value=name;update();});area.addEventListener('input',()=>{const total=area.value.split('\n').length;state.bookmarks[name]=state.bookmarks[name].filter(value=>value<=total);update();});area.addEventListener('scroll',()=>paintWhitespace(name));area.addEventListener('click',()=>{line.value=String(lineNumber(area));});new ResizeObserver(()=>paintWhitespace(name)).observe(area);}
 document.addEventListener('display-settings-change',()=>{for(const name of ['a','b']){areas[name].style.color=originals[name].color;originals[name].computedColor=getComputedStyle(areas[name]).color;}update();});
 function command(action){if(!enabled)return;const actions={find:openSearch,'find-next':()=>find(1),'find-previous':()=>find(-1),'go-line':()=>{openMore();line.focus();line.select();},'bookmark-toggle':toggleBookmark,'bookmark-next':()=>jumpBookmark(1),'bookmark-previous':()=>jumpBookmark(-1),'copy-lines':copyLines};actions[action]?.();}
 document.addEventListener('keydown',event=>{if(window.desktop||!enabled||!host.getClientRects().length||(!host.contains(event.target)&&!main.contains(event.target)&&event.target!==areas.a&&event.target!==areas.b))return;if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const key=event.key.toLowerCase();if(['f','g','l'].includes(key)){event.preventDefault();event.stopPropagation();command(key==='f'?'find':key==='l'?'go-line':event.shiftKey?'find-previous':'find-next');}});
 function setState(saved){lastZero=null;state=initial();if(saved){state.side=saved.side==='b'?'b':'a';for(const key of ['query','replacement'])if(typeof saved[key]==='string')state[key]=saved[key];for(const key of ['matchCase','regex','wrap','whitespace'])state[key]=saved[key]===true;for(const name of ['a','b'])state.bookmarks[name]=[...new Set((saved.bookmarks?.[name]||[]).filter(value=>Number.isInteger(value)&&value>0&&value<=areas[name].value.split('\n').length))].sort((a,b)=>a-b);}update();}
 function cancelPendingEdits(){revision++;clearTimeout(countTimer);countJob?.cancel();countJob=null;actionJob?.cancel();actionJob=null;}
 update();return {cancelPendingEdits,getState:()=>({...state,bookmarks:{a:[...state.bookmarks.a],b:[...state.bookmarks.b]}}),setState,command,setEnabled(value){enabled=Boolean(value);if(!enabled&&more.open)more.close();host.hidden=!enabled;update();}};
}
