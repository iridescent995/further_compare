import {createContextMenu} from './context-menu.js';
import {aiffPlaybackWav} from './aiff.cjs';
import {parseAudio,compareAudio} from './audio-diff.cjs';
import {decodeFlac,isFlac} from './flac.cjs';
import {decodeMp3,isMp3} from './mp3.cjs';
const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
export function createMediaCompare({host,desktop,notify=()=>{},onDirty=()=>{}}){
 let inputs={a:null,b:null},decoded={a:null,b:null},options={offset:0,tolerance:0},report=null,epoch=0;let requests={a:0,b:0},pending={a:false,b:false};const urls={},views={};const contextMenu=createContextMenu('mediaContext','Audio comparison actions');let menuTicket=0,playbackRequest=0;const actionButtons=[];
 const closeMenu=()=>{menuTicket++;contextMenu.close();};
 host.classList.add('media-compare');const toolbar=make('div','media-toolbar'),panes=make('div','media-panes'),status=make('p','media-status','Open two WAV, AIFF, FLAC or MP3 files to compare audio samples.');
 const invoke=fn=>{try{Promise.resolve(fn()).catch(error=>notify(error.message,true));}catch(error){notify(error.message,true);}};
 const action=(label,run,disabled)=>({label,run,disabled});
 const actions=[
  action('Open left audio',()=>openSide('a'),()=>!desktop),
  action('Open right audio',()=>openSide('b'),()=>!desktop),
  action('Listen together',listenTogether,()=>pending.a||pending.b||!decoded.a||!decoded.b),
  action('Pause both',pauseBoth,()=>!decoded.a&&!decoded.b),
  action('Save audio report',saveResult,()=>pending.a||pending.b||!report)
 ];
 for(const item of actions){const button=make('button','button',item.label);button.onclick=()=>{if(!item.disabled())invoke(item.run);};toolbar.append(button);actionButtons.push({button,item});}
 function refreshControls(){for(const {button,item} of actionButtons)button.disabled=Boolean(item.disabled());for(const key of ['offset','tolerance'])if(views[key])views[key].disabled=pending.a||pending.b;}
 async function listenTogether(){
  if(pending.a||pending.b)throw Error('Wait for audio loading to finish.');if(!decoded.a||!decoded.b)throw Error('Open two WAV, AIFF, FLAC or MP3 files first.');
  const request=++playbackRequest;
  try{views.a.audio.currentTime=Math.max(0,options.offset);views.b.audio.currentTime=Math.max(0,-options.offset);await Promise.all([views.a.audio.play(),views.b.audio.play()]);}
  catch(error){if(request!==playbackRequest)return;
   // Native audio controls can also pause a pending play request. Keep genuine
   // current decode/device failures visible; only a paused AbortError is expected.
   if(error?.name==='AbortError'&&(views.a.audio.paused||views.b.audio.paused))return;
   throw error;
  }
 }
 function pauseBoth(){playbackRequest++;views.a.audio.pause();views.b.audio.pause();}
 for(const [key,label,min,max,step]of [['offset','Right offset (seconds)',-3600,3600,.001],['tolerance','Sample tolerance',0,2,.0001]]){const wrapper=make('label',null,label+' '),control=make('input');control.type='number';Object.assign(control,{min,max,step,value:0});control.setAttribute('aria-label',label);control.onchange=()=>{const value=Number(control.value);if(!Number.isFinite(value)||value<min||value>max){control.value=options[key];notify('Choose a value within the displayed range.',true);return;}options[key]=value;onDirty();compare();};wrapper.append(control);toolbar.append(wrapper);views[key]=control;}
 for(const side of ['a','b']){const pane=make('section','media-pane'),title=make('h3',null,side==='a'?'Left audio':'Right audio'),meta=make('p','media-meta','No audio selected'),canvas=make('canvas','media-wave'),audio=make('audio');audio.controls=true;audio.preload='metadata';canvas.width=1000;canvas.height=180;pane.tabIndex=0;pane.setAttribute('role','group');pane.setAttribute('aria-label',(side==='a'?'Left':'Right')+' audio comparison');pane.append(title,meta,canvas,audio);panes.append(pane);views[side]={pane,title,meta,canvas,audio};}
 host.replaceChildren(toolbar,status,panes);refreshControls();
 const nativeContext=target=>target.isContentEditable||target.closest('input,textarea,select,audio');
 function showContext(event,keyboard=false){
  if(nativeContext(event.target))return;
  const pane=event.target.closest('.media-pane'),restore=pane||(host.contains(document.activeElement)?document.activeElement:views.a.pane);
  event.preventDefault();event.stopPropagation();closeMenu();const ticket=menuTicket,token=epoch,leftRequest=requests.a,rightRequest=requests.b,currentReport=report,offset=options.offset,tolerance=options.tolerance;
  const valid=()=>ticket===menuTicket&&token===epoch&&leftRequest===requests.a&&rightRequest===requests.b&&currentReport===report&&offset===options.offset&&tolerance===options.tolerance&&host.isConnected&&!host.closest('[hidden]')&&document.getElementById('mediaContext')?.hidden===false;
  const entries=actions.map(item=>({label:item.label,disabled:item.disabled(),validate:()=>valid()&&!item.disabled(),action:()=>invoke(item.run)}));
  entries.push({separator:true},...['offset','tolerance'].map(key=>({label:key==='offset'?'Right offset (seconds)':'Sample tolerance',disabled:pending.a||pending.b,validate:()=>valid()&&!pending.a&&!pending.b,action:()=>views[key].focus()})));
  const rect=restore.getBoundingClientRect();contextMenu.open(entries,keyboard?rect.left+12:event.clientX,keyboard?rect.top+Math.min(rect.height,28):event.clientY,()=>{if(restore.isConnected&&!host.closest('[hidden]'))restore.focus({preventScroll:true});});
 }
 host.addEventListener('contextmenu',event=>showContext(event));
 host.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')showContext(event,true);});
 function draw(side){const {canvas,meta,title}=views[side],audio=decoded[side],ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);title.textContent=(side==='a'?'Left':'Right')+' audio'+(inputs[side]?' · '+inputs[side].name:'');if(!audio){meta.textContent='No audio selected';return;}meta.textContent=`${audio.container} · ${audio.sampleRate.toLocaleString()} Hz · ${audio.channels} channel${audio.channels===1?'':'s'} · ${audio.container==='MP3'?'lossy · decoded samples':audio.bits+'-bit '+audio.format} · ${audio.duration.toFixed(3)} s${audio.container==='FLAC'?(audio.checksum==='verified'?' · Audio MD5 verified':' · No audio MD5 stored'):''}`;ctx.strokeStyle=side==='a'?'#9971bd':'#468e94';ctx.beginPath();for(let x=0;x<canvas.width;x++){let low=0,high=0;const start=Math.floor(x*audio.samples.length/canvas.width),end=Math.min(audio.samples.length,Math.max(start+1,Math.floor((x+1)*audio.samples.length/canvas.width)));for(let i=start;i<end;i++){low=Math.min(low,audio.samples[i]);high=Math.max(high,audio.samples[i]);}ctx.moveTo(x,90-Math.max(-1,Math.min(1,high))*85);ctx.lineTo(x,90-Math.max(-1,Math.min(1,low))*85);}ctx.stroke();}
 function compare(){closeMenu();report=null;refreshControls();status.title='';draw('a');draw('b');if(pending.a||pending.b){status.textContent='Loading audio…';return;}if(!decoded.a||!decoded.b){status.textContent='Open two WAV, AIFF, FLAC or MP3 files to compare audio samples.';return;}try{report=compareAudio(decoded.a,decoded.b,options);const lossy=decoded.a.container==='MP3'||decoded.b.container==='MP3';status.textContent=(report.equal?(lossy?'Decoded samples match.':'Audio samples are identical.'):`${report.differentSamples.toLocaleString()} different samples · ${report.missingSamples.toLocaleString()} unmatched · peak difference ${report.maxDifference.toFixed(6)} · RMS ${report.rmsDifference.toFixed(6)}`)+(lossy?' · MP3 (lossy)':'');if(lossy)status.title='MP3 is lossy; this compares decoded samples, not original recording samples or compressed file bytes. Decoder delay, padding and implementation can affect alignment and sample values.';}catch(error){status.textContent=error.message;}refreshControls();}
 async function prepare(input){
  if(typeof input?.data!=='string'||input.data.length>Math.ceil(32*1024*1024/3)*4)throw Error('Choose a WAV, AIFF, FLAC or MP3 file up to 32 MB.');
  const saved={name:input.name,data:input.data,...(input.diskToken?{diskToken:input.diskToken}:{})};
  let bytes;try{bytes=Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0));}catch{throw Error('Invalid saved audio data.');}
  const flac=isFlac(bytes),mp3=!flac&&isMp3(bytes),parsed=flac?await decodeFlac(bytes):mp3?await decodeMp3(bytes):parseAudio(bytes);
  return {saved,parsed,playback:parsed.container==='AIFF'?aiffPlaybackWav(parsed):bytes,mime:mp3?'audio/mpeg':flac?'audio/flac':'audio/wav'};
 }
 function commit(side,value){
  playbackRequest++;
  inputs[side]=value.saved;decoded[side]=value.parsed;views[side].audio.pause();if(urls[side])URL.revokeObjectURL(urls[side]);
  urls[side]=URL.createObjectURL(new Blob([value.playback],{type:value.mime}));views[side].audio.src=urls[side];
 }
 function loading(){closeMenu();refreshControls();host.setAttribute('aria-busy',String(pending.a||pending.b));if(pending.a||pending.b)status.textContent='Loading audio…';else compare();}
 async function openSide(side){
  if(!['a','b'].includes(side))throw Error('Invalid audio side.');if(!desktop)throw Error('Open audio files in the desktop app.');
  const token=epoch,request=++requests[side];pending[side]=true;loading();
  try{const input=await desktop.openData(side,'audio');if(!input||token!==epoch||request!==requests[side])return;
   const value=await prepare(input);if(token!==epoch||request!==requests[side])return;commit(side,value);onDirty();
  }catch(error){if(token===epoch&&request===requests[side])throw error;}
  finally{if(token===epoch&&request===requests[side]){pending[side]=false;loading();}}
 }
 async function setState(state=null){
  reset();const token=epoch,tickets={a:++requests.a,b:++requests.b};const current=()=>token===epoch&&tickets.a===requests.a&&tickets.b===requests.b;const nextOptions={offset:0,tolerance:0};for(const key of ['offset','tolerance'])if(Number.isFinite(state?.options?.[key]))nextOptions[key]=state.options[key];
  if(Math.abs(nextOptions.offset)>3600||nextOptions.tolerance<0||nextOptions.tolerance>2){nextOptions.offset=0;nextOptions.tolerance=0;}
  const savedInputs={a:state?.inputs?.a,b:state?.inputs?.b};pending={a:!!savedInputs.a,b:!!savedInputs.b};loading();
  try{const values={};for(const side of ['a','b']){if(savedInputs[side])values[side]=await prepare(savedInputs[side]);if(!current())return;}
   options=nextOptions;views.offset.value=options.offset;views.tolerance.value=options.tolerance;for(const side of ['a','b'])if(values[side])commit(side,values[side]);
  }catch(error){if(current())throw error;}
  finally{if(token===epoch){for(const side of ['a','b'])if(tickets[side]===requests[side])pending[side]=false;loading();}}
 }
 function reset(){playbackRequest++;closeMenu();epoch++;requests={a:0,b:0};pending={a:false,b:false};host.setAttribute('aria-busy','false');for(const side of ['a','b']){views[side].audio.pause();views[side].audio.removeAttribute('src');views[side].audio.load();if(urls[side])URL.revokeObjectURL(urls[side]);delete urls[side];}inputs={a:null,b:null};decoded={a:null,b:null};options={offset:0,tolerance:0};views.offset.value=0;views.tolerance.value=0;compare();}
 async function saveResult(){if(pending.a||pending.b)throw Error('Wait for audio loading to finish.');if(!report)throw Error('Open two compatible WAV, AIFF, FLAC or MP3 files first.');const details=side=>{const {container,sampleRate,channels,bits,format,frames,duration}=decoded[side];return {container,sampleRate,channels,...(container==='MP3'?{sourceFormat:format,lossy:true,decodedSampleFormat:'normalized floating-point samples',mpegVersion:decoded[side].mpegVersion,variableBitrate:decoded[side].variableBitrate,gaplessTrimmedFrames:decoded[side].gaplessTrimmedFrames,comparisonBasis:'decoded samples',note:'MP3 is lossy. Decoded samples do not represent original recording samples or compressed file equality. Decoder delay, padding and implementation can affect alignment and sample values.'}:{bits,format}),frames,duration,...(container==='FLAC'?{comparisonBasis:'decoded samples',streamMd5:decoded[side].checksum}:{})};};const value=JSON.stringify({type:'audio-compare',comparisonBasis:'decoded samples',left:inputs.a.name,right:inputs.b.name,leftAudio:details('a'),rightAudio:details('b'),...report},null,2),data=btoa(String.fromCharCode(...new TextEncoder().encode(value)));if(desktop)return desktop.saveData(data,'audio-comparison.json');const link=make('a');link.href='data:application/json;base64,'+data;link.download='audio-comparison.json';link.click();}
 return {openSide,setState,getState:()=>({inputs:{...inputs,base:null},options:{...options}}),saveResult,reset};
}
