import {createContextMenu} from './context-menu.js';
const MAX_BYTES=32*1024*1024,MAX_PIXELS=16*1024*1024;
const DEFAULT_OPTIONS={threshold:0,view:'split',opacity:0.5,zoom:'fit'};
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function imageType(bytes){
 if(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';
 if(bytes[0]===255&&bytes[1]===216)return 'image/jpeg';
 if(String.fromCharCode(...bytes.slice(0,3))==='GIF')return 'image/gif';
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 throw Error('Choose a PNG, JPEG, WebP, or GIF image.');
}
function binaryImage(data){
 if(typeof data!=='string'||data.length>Math.ceil(MAX_BYTES/3)*4+4)throw Error('Choose an image smaller than 32 MB.');
 let binary;try{binary=atob(data);}catch{throw Error('The saved image data is invalid.');}
 if(binary.length>MAX_BYTES)throw Error('Choose an image smaller than 32 MB.');
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new Blob([bytes],{type:imageType(bytes)});
}
async function decode(input){
 if(!input)return null;
 const blob=binaryImage(input.data);let image;
 try{
  image=await createImageBitmap(blob);
  const width=image.width,height=image.height;
  if(!width||!height||width*height>MAX_PIXELS||width>32767||height>32767)throw Error('Images must be at most 16 megapixels and 32,767 pixels on either side.');
  const canvas=make('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});canvas.width=width;canvas.height=height;
  // Decoding the blob as an ImageBitmap captures the default first frame.
  context.drawImage(image,0,0);return {canvas,width,height,pixels:context.getImageData(0,0,width,height).data};
 }catch(error){if(error.name==='EncodingError')throw Error('This image could not be decoded. Choose a valid PNG, JPEG, WebP, or GIF.');throw error;}
 finally{image?.close();}
}
export function createPictureCompare({host,desktop,notify=()=>{},onDirty=()=>{}}){
 let inputs={a:null,b:null},options={...DEFAULT_OPTIONS},decoded={a:null,b:null},generation=0,loadGeneration=0,difference=null,timer;const sideLoad={a:0,b:0},pending={a:false,b:false};
 const contextMenu=createContextMenu('pictureContext','Picture comparison actions');let menuTicket=0;
 const closeMenu=()=>{menuTicket++;contextMenu.close();};
 const busy=()=>pending.a||pending.b;
 const invoke=action=>{try{Promise.resolve(action()).catch(error=>notify(error.message,true));}catch(error){notify(error.message,true);}};
 host.classList.add('picture-compare');
 const toolbar=make('div','picture-toolbar'),controls=make('div','picture-controls'),status=make('p','picture-status','Open two images to compare their pixels.'),panes=make('div','picture-panes'),single=make('div','picture-single picture-scroll');single.hidden=true;
 const views={};
 const button=(text,action)=>{const el=make('button','button',text);el.type='button';el.onclick=()=>invoke(action);return el;};
 const openA=button('Open left image',()=>openSide('a')),openB=button('Open right image',()=>openSide('b')),exportButton=button('Save difference PNG',saveResult);
 toolbar.append(openA,openB,exportButton);
 const select=(label,choices,key)=>{const wrapper=make('label',null,label+' '),input=make('select');input.setAttribute('aria-label',label);for(const [value,text]of choices){const option=make('option',null,text);option.value=value;input.append(option);}input.onchange=()=>changeOption(key,input.value);wrapper.append(input);controls.append(wrapper);return input;};
 const viewControl=select('View',[['split','Side by side'],['difference','Difference'],['overlay','Overlay']],'view');
 const zoomControl=select('Zoom',[['fit','Fit'],['0.5','50%'],['1','100%'],['2','200%']],'zoom');
 const thresholdLabel=make('label',null,'Pixel tolerance '),threshold=make('input'),thresholdValue=make('output',null,'0');threshold.type='range';threshold.min='0';threshold.max='255';threshold.step='1';threshold.value='0';threshold.setAttribute('aria-label','Pixel tolerance');threshold.oninput=()=>{closeMenu();options.threshold=Number(threshold.value);thresholdValue.textContent=threshold.value;onDirty();++generation;difference=null;render();status.textContent='Comparing pixels…';clearTimeout(timer);timer=setTimeout(compare,100);};thresholdLabel.append(threshold,thresholdValue);controls.append(thresholdLabel);
 const opacityLabel=make('label',null,'Right opacity '),opacity=make('input'),opacityValue=make('output',null,'50%');opacity.type='range';opacity.min='0';opacity.max='1';opacity.step='0.01';opacity.value='0.5';opacity.setAttribute('aria-label','Right image opacity');opacity.oninput=()=>{closeMenu();options.opacity=Number(opacity.value);opacityValue.textContent=Math.round(options.opacity*100)+'%';onDirty();render();};opacityLabel.append(opacity,opacityValue);controls.append(opacityLabel);
 for(const side of ['a','b']){
  const pane=make('section','picture-pane'),title=make('header',null,side==='a'?'Left image':'Right image'),scroll=make('div','picture-scroll'),empty=make('div','picture-empty','Open an image');
  pane.tabIndex=0;pane.setAttribute('role','group');pane.setAttribute('aria-label',(side==='a'?'Left':'Right')+' image comparison');scroll.append(empty);pane.append(title,scroll);panes.append(pane);views[side]={pane,title,scroll,empty};installPan(scroll);
 }
 single.tabIndex=0;single.setAttribute('role','group');single.setAttribute('aria-label','Combined image comparison');installPan(single);host.replaceChildren(toolbar,controls,panes,single,status);
 const hint=make('span','picture-hint','Pixel colors include transparency. Magenta marks differences; dim gray marks matching pixels. Drag to pan when zoomed. Animated images use their first frame.');host.append(hint);
 function changeOption(key,value){closeMenu();options[key]=value;onDirty();render();}
 const nativeContext=target=>target.isContentEditable||target.closest('input,textarea,select');
 function showContext(event,keyboard=false){
  if(nativeContext(event.target))return;
  const pane=event.target.closest('.picture-pane,.picture-single'),restore=pane||(host.contains(document.activeElement)?document.activeElement:(options.view==='split'?views.a.pane:single));
  event.preventDefault();event.stopPropagation();closeMenu();
  const ticket=menuTicket,load=loadGeneration,comparison=generation,left=sideLoad.a,right=sideLoad.b,result=difference,state=JSON.stringify(options);
  const valid=()=>ticket===menuTicket&&load===loadGeneration&&comparison===generation&&left===sideLoad.a&&right===sideLoad.b&&result===difference&&state===JSON.stringify(options)&&host.isConnected&&!host.closest('[hidden]')&&document.getElementById('pictureContext')?.hidden===false;
  const entry=(label,action,disabled=()=>false)=>({label,disabled:disabled(),validate:()=>valid()&&!disabled(),action:()=>invoke(action)});
  const entries=[entry('Open left image',()=>openSide('a')),entry('Open right image',()=>openSide('b')),entry('Save difference PNG',saveResult,()=>busy()||!difference),{separator:true},
   {label:'View',children:[['split','Side by side'],['difference','Difference'],['overlay','Overlay']].map(([value,label])=>entry(label,()=>changeOption('view',value)))},
   {label:'Zoom',children:[['fit','Fit'],['0.5','50%'],['1','100%'],['2','200%']].map(([value,label])=>entry(label,()=>changeOption('zoom',value)))},
   {separator:true},entry('Pixel tolerance',()=>threshold.focus(),busy),entry('Right image opacity',()=>opacity.focus(),()=>busy()||options.view!=='overlay')];
  const rect=restore.getBoundingClientRect();contextMenu.open(entries,keyboard?rect.left+12:event.clientX,keyboard?rect.top+Math.min(rect.height,28):event.clientY,()=>{if(restore.isConnected&&!restore.closest('[hidden]'))restore.focus({preventScroll:true});});
 }
 host.addEventListener('contextmenu',event=>showContext(event));
 host.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')showContext(event,true);});
 function installPan(scroll){let drag=null;scroll.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.tagName!=='CANVAS')return;drag={x:event.clientX,y:event.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(event.pointerId);scroll.classList.add('panning');event.preventDefault();});scroll.addEventListener('pointermove',event=>{if(drag){scroll.scrollLeft=drag.left+drag.x-event.clientX;scroll.scrollTop=drag.top+drag.y-event.clientY;}});const end=()=>{drag=null;scroll.classList.remove('panning');};scroll.addEventListener('pointerup',end);scroll.addEventListener('pointercancel',end);}
 function sizeCanvas(canvas,scroll){const scale=options.zoom==='fit'?Math.min(1,Math.max(1,scroll.clientWidth-24)/canvas.width,Math.max(1,scroll.clientHeight-24)/canvas.height):Number(options.zoom);canvas.style.width=Math.max(1,Math.round(canvas.width*scale))+'px';canvas.style.height=Math.max(1,Math.round(canvas.height*scale))+'px';}
 function render(){
  viewControl.value=options.view;zoomControl.value=options.zoom;threshold.value=options.threshold;thresholdValue.textContent=options.threshold;opacity.value=options.opacity;opacityValue.textContent=Math.round(options.opacity*100)+'%';opacityLabel.hidden=options.view!=='overlay';exportButton.disabled=busy()||!difference;threshold.disabled=busy();opacity.disabled=busy();host.setAttribute('aria-busy',String(busy()));
  panes.hidden=options.view!=='split';single.hidden=options.view==='split';
  for(const side of ['a','b']){const view=views[side],image=decoded[side];view.title.textContent=(side==='a'?'Left':'Right')+(inputs[side]?' · '+inputs[side].name:'')+(image?' · '+image.width+' × '+image.height:'');if(image){if(view.scroll.firstChild!==image.canvas)view.scroll.replaceChildren(image.canvas);sizeCanvas(image.canvas,view.scroll);}else view.scroll.replaceChildren(view.empty);}
  if(options.view==='split')return;
  if(!difference){single.replaceChildren(make('div','picture-empty','Open two images to see this view.'));return;}
  let canvas=difference;
  if(options.view==='overlay'){canvas=make('canvas');canvas.width=difference.width;canvas.height=difference.height;const context=canvas.getContext('2d');context.drawImage(decoded.a.canvas,0,0);context.globalAlpha=options.opacity;context.drawImage(decoded.b.canvas,0,0);}
  single.replaceChildren(canvas);sizeCanvas(canvas,single);
 }
 async function compare(){
  closeMenu();clearTimeout(timer);const epoch=++generation;difference=null;render();
  if(busy()){status.textContent='Loading images…';return;}
  if(!decoded.a||!decoded.b){status.textContent='Open two images to compare their pixels.';return;}
  const a=decoded.a,b=decoded.b,width=Math.max(a.width,b.width),height=Math.max(a.height,b.height);
  if(width*height>MAX_PIXELS){status.textContent='The combined comparison area exceeds 16 megapixels. Choose smaller images.';notify(status.textContent,true);return;}
  status.textContent='Comparing pixels…';const canvas=make('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d'),out=context.createImageData(width,height),pixels=out.data,tolerance=options.threshold;let changed=0;
  for(let y=0;y<height;y++){
   for(let x=0;x<width;x++){
    const index=(y*width+x)*4,ai=(y*a.width+x)*4,bi=(y*b.width+x)*4,presentA=x<a.width&&y<a.height,presentB=x<b.width&&y<b.height;
    const differs=!presentA||!presentB||Math.max(Math.abs(a.pixels[ai]-b.pixels[bi]),Math.abs(a.pixels[ai+1]-b.pixels[bi+1]),Math.abs(a.pixels[ai+2]-b.pixels[bi+2]),Math.abs(a.pixels[ai+3]-b.pixels[bi+3]))>tolerance;
    if(differs){changed++;pixels[index]=238;pixels[index+1]=48;pixels[index+2]=149;}else{const gray=Math.round((a.pixels[ai]+a.pixels[ai+1]+a.pixels[ai+2])/3*0.35);pixels[index]=gray;pixels[index+1]=gray;pixels[index+2]=gray;}pixels[index+3]=255;
   }
   if(y%32===0){await frame();if(epoch!==generation)return;}
  }
  if(epoch!==generation)return;context.putImageData(out,0,0);difference=canvas;status.textContent=`${changed.toLocaleString()} of ${(width*height).toLocaleString()} pixels differ (${(changed/(width*height)*100).toFixed(2)}%) · Left ${a.width} × ${a.height} · Right ${b.width} × ${b.height} · Tolerance ${tolerance}/255`;render();
 }
 async function openSide(side){
  if(!['a','b'].includes(side))throw Error('Choose the left or right side.');
  closeMenu();const token=++sideLoad[side],loadEpoch=loadGeneration;let input;pending[side]=true;++generation;difference=null;clearTimeout(timer);render();status.textContent='Loading images…';
  try{
  if(desktop){const result=await desktop.openData(side,'image');if(!result||result.cancelled)return;input={name:result.name,data:result.data,...(result.diskToken?{diskToken:result.diskToken}:{})};}
  else{input=await new Promise(resolve=>{const picker=make('input');picker.type='file';picker.accept='image/png,image/jpeg,image/webp,image/gif';picker.oncancel=()=>resolve(null);picker.onchange=async()=>{const file=picker.files[0];if(!file){resolve(null);return;}if(file.size>MAX_BYTES){notify('Choose an image smaller than 32 MB.',true);resolve(null);return;}const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:String(reader.result).split(',')[1]});reader.onerror=()=>{notify('The image could not be read.',true);resolve(null);};reader.readAsDataURL(file);};picker.click();});}
  if(!input||token!==sideLoad[side]||loadEpoch!==loadGeneration)return;const image=await decode(input);if(token!==sideLoad[side]||loadEpoch!==loadGeneration)return;inputs[side]=input;decoded[side]=image;onDirty();
  }catch(error){if(token===sideLoad[side]&&loadEpoch===loadGeneration)throw error;}
  finally{if(token===sideLoad[side]&&loadEpoch===loadGeneration){pending[side]=false;await compare();}}
 }
 async function saveResult(){
  if(busy())throw Error('Wait for image loading to finish.');
  if(!difference)throw Error('Open two images and wait for comparison before exporting.');
  const base64=difference.toDataURL('image/png').split(',')[1];
  if(desktop)return desktop.saveData(base64,'image-difference.png');
  const link=make('a');link.href='data:image/png;base64,'+base64;link.download='image-difference.png';link.click();
 }
 async function setState(state=null){
  closeMenu();const token=++loadGeneration,tickets={a:++sideLoad.a,b:++sideLoad.b};++generation;pending.a=!!state?.inputs?.a;pending.b=!!state?.inputs?.b;clearTimeout(timer);inputs={a:null,b:null};decoded={a:null,b:null};difference=null;options={...DEFAULT_OPTIONS};
  if(state){const candidate=state.options||{};options.threshold=Math.max(0,Math.min(255,Number(candidate.threshold)||0));options.opacity=Math.max(0,Math.min(1,Number.isFinite(candidate.opacity)?candidate.opacity:0.5));if(['split','difference','overlay'].includes(candidate.view))options.view=candidate.view;if(['fit','0.5','1','2'].includes(String(candidate.zoom)))options.zoom=String(candidate.zoom);}
  render();if(busy())status.textContent='Loading images…';
  try{for(const side of ['a','b'])if(state?.inputs?.[side]){const input=state.inputs[side];if(typeof input.name!=='string')throw Error('Invalid image name in session.');const image=await decode(input);if(token!==loadGeneration)return;if(tickets[side]!==sideLoad[side])continue;inputs[side]={name:input.name,data:input.data,...(input.diskToken?{diskToken:input.diskToken}:{})};decoded[side]=image;}}

  catch(error){if(token===loadGeneration){render();status.textContent='Image could not be loaded.';notify(error.message,true);throw error;}}
  finally{if(token===loadGeneration){for(const side of ['a','b'])if(tickets[side]===sideLoad[side])pending[side]=false;await compare();}}
 }
 const resize=new ResizeObserver(()=>render());resize.observe(host);render();
 return {setState,getState:()=>({inputs:{a:inputs.a?{...inputs.a}:null,b:inputs.b?{...inputs.b}:null,base:null},options:{...options}}),openSide,saveResult,reset:()=>setState(null)};
}
