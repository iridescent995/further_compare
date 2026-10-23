const STORAGE_KEY='further-compare.display.v1';
const defaults={theme:'light',density:'compact',fontSize:13};
function validated(value){return {theme:['system','light','dark'].includes(value?.theme)?value.theme:defaults.theme,density:['compact','comfortable'].includes(value?.density)?value.density:defaults.density,fontSize:[12,13,14,15].includes(value?.fontSize)?value.fontSize:defaults.fontSize};}
export function createDisplaySettings({host,notify=()=>{},captureFocus}){
 if(!host)throw new Error('Display settings need a host element.');
 const media=window.matchMedia('(prefers-color-scheme: dark)');let preferences={...defaults},restoreFocus=null,storageNotice=false;
 try{preferences=validated(JSON.parse(localStorage.getItem(STORAGE_KEY)));}catch{}
 const make=(tag,text)=>{const item=document.createElement(tag);if(text)item.textContent=text;return item;};
 const trigger=make('button','Display');trigger.type='button';trigger.className='display-settings-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-label','Display');trigger.title='Display theme, density and text size';
 const dialog=make('dialog');dialog.className='display-settings-dialog';dialog.setAttribute('aria-label','Display preferences');
 const title=make('h2','Your workspace, your view'),intro=make('p','Warm coral, mint, amber and orchid accents. Choose your brightness and reading size.');intro.className='display-settings-description';dialog.append(title,intro);
 const fields={};
 const addField=(key,label,values)=>{const wrapper=make('label',label),select=make('select');wrapper.className='display-settings-field';for(const [value,text]of values){const option=make('option',text);option.value=String(value);select.append(option);}select.setAttribute('aria-label',label);fields[key]=select;select.onchange=()=>{preferences=validated({...preferences,[key]:key==='fontSize'?Number(select.value):select.value});apply();save();};wrapper.append(select);dialog.append(wrapper);};
 addField('theme','Theme',[['light','Light · Confetti'],['dark','Dark · Jewel'],['system','Follow system']]);
 const palette=make('div');palette.className='display-palette';palette.setAttribute('aria-hidden','true');for(const color of ['coral','gold','teal','right','pink']){const swatch=make('span');swatch.style.setProperty('--swatch',`var(--ui-${color})`);palette.append(swatch);}dialog.append(palette);
 addField('density','Density',[['compact','Compact'],['comfortable','Comfortable']]);
 addField('fontSize','Text size',[[12,'12 px'],[13,'13 px'],[14,'14 px'],[15,'15 px']]);
 const preview=make('div');preview.className='display-settings-preview';for(const [label,kind]of [['Matching','same'],['Changed','changed'],['Left only','left'],['Right only','right']]){const token=make('span',label);token.className=kind;preview.append(token);}dialog.append(preview);
 const footer=make('div');footer.className='display-settings-footer';const reset=make('button','Reset appearance'),close=make('button','Done');reset.type=close.type='button';close.className='display-settings-done';reset.onclick=()=>{preferences={...defaults};apply();save();};close.onclick=()=>dialog.close();footer.append(reset,close);dialog.append(footer);host.append(trigger);document.body.append(dialog);
 function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(preferences));storageNotice=false;}catch{if(!storageNotice){notify('Display preferences apply now, but could not be saved on this device.');storageNotice=true;}}}
 function apply(){const theme=preferences.theme==='system'?(media.matches?'dark':'light'):preferences.theme;document.body.dataset.theme=theme;document.body.dataset.density=preferences.density;document.body.dataset.fontSize=String(preferences.fontSize);document.body.style.setProperty('--ui-font-size',preferences.fontSize+'px');for(const [key,select]of Object.entries(fields))select.value=String(preferences[key]);document.dispatchEvent(new CustomEvent('display-settings-change',{detail:{...preferences,resolvedTheme:theme}}));}
 trigger.onclick=()=>{if(dialog.open){fields.theme.focus();return;}const origin=document.activeElement;restoreFocus=captureFocus?.(origin)||(()=>{if(origin?.isConnected)origin.focus();});dialog.showModal();fields.theme.focus();};dialog.addEventListener('close',()=>{const restore=restoreFocus;restoreFocus=null;restore?.();});
 const systemChanged=()=>{if(preferences.theme==='system')apply();};media.addEventListener('change',systemChanged);
 const storageChanged=event=>{if(event.key===STORAGE_KEY){try{preferences=validated(JSON.parse(event.newValue));apply();}catch{}}};window.addEventListener('storage',storageChanged);apply();
 return {open(){trigger.click();},getPreferences(){return {...preferences};},setPreferences(value,persist=true){const next=validated(value);if(persist)localStorage.setItem(STORAGE_KEY,JSON.stringify(next));preferences=next;apply();},destroy(){media.removeEventListener('change',systemChanged);window.removeEventListener('storage',storageChanged);dialog.remove();trigger.remove();}};
}
