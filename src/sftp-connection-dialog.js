// Credentials belong only to this modal and the transient native connect call.
export function createSftpConnectionDialog({desktop,notify=()=>{},onAttached,isCurrent=()=>true}){
 const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
 const dialog=element('dialog',undefined,'text-options-dialog');dialog.id='sftpConnectionDialog';dialog.setAttribute('aria-labelledby','sftpConnectionTitle');
 const header=element('header'),title=element('h2','Connect to a server');title.id='sftpConnectionTitle';header.append(title);
 const description=element('p','Review the server key before signing in.','options-description'),form=element('form'),fields=element('div',undefined,'text-options-controls');
 form.style.display='block';fields.style.display='grid';fields.style.gridTemplateColumns='minmax(0, 1fr) 100px';fields.style.gap='12px';
 const inputs={};
 for(const [name,label,type,value] of [['host','Host','text',''],['port','Port','number','22'],['username','Username','text',''],['password','Password','password',''],['root','Folder','text','/']]){
  const field=element('label',label,'editor-settings-field'),input=element('input');input.name=name;input.type=type;input.value=value;input.autocomplete=name==='password'?'new-password':'off';input.spellcheck=false;input.required=name!=='password';
  input.style.border='0';input.style.background='var(--ui-bg, #f4f1f8)';input.style.borderRadius='8px';input.style.padding='9px 10px';input.style.minWidth='0';
  if(name==='port'){input.min='1';input.max='65535';input.step='1';}else input.maxLength=name==='host'?253:name==='username'?256:name==='root'?4096:16384;
  field.style.margin='0';
  if(!['host','port'].includes(name))field.style.gridColumn='1 / -1';field.append(input);fields.append(field);inputs[name]=input;
 }
 const keyEnabled=['chooseSftpKey','discardSftpKey'].every(name=>typeof desktop?.[name]==='function');
 const authField=element('label','Authentication','editor-settings-field'),auth=element('select'),keyField=element('div'),chooseKey=element('button','Choose key file','button'),keyName=element('span','No key selected'),passField=element('label','Key passphrase (optional)','editor-settings-field'),passphrase=element('input');
 auth.name='authentication';auth.add(new Option('Password','password'));if(keyEnabled)auth.add(new Option('Private key','key'));
 passphrase.name='passphrase';passphrase.type='password';passphrase.autocomplete='new-password';passphrase.maxLength=16384;chooseKey.type='button';chooseKey.id='sftpChooseKey';keyName.id='sftpKeyName';keyName.setAttribute('aria-live','polite');
 for(const control of [auth,chooseKey,passphrase]){control.style.border='0';control.style.borderRadius='8px';control.style.background='var(--ui-bg, #f4f1f8)';control.style.padding='9px 10px';control.style.minWidth='0';}
 for(const field of [authField,keyField,passField]){field.style.gridColumn='1 / -1';field.style.margin='0';}
 authField.append(auth);keyField.append(chooseKey,document.createTextNode(' '),keyName);passField.append(passphrase);fields.insertBefore(authField,inputs.password.parentElement);fields.insertBefore(keyField,inputs.root.parentElement);fields.insertBefore(passField,inputs.root.parentElement);
 const profilesEnabled=['listSftpProfiles','saveSftpProfile','removeSftpProfile'].every(name=>typeof desktop?.[name]==='function');
 const profiles=element('section'),profileSelect=element('select'),profileName=element('input'),profileSave=element('button','Save profile','button'),profileDelete=element('button','Delete profile','button'),profileStatus=element('p');
 profiles.hidden=!profilesEnabled;profiles.style.marginBottom='12px';profiles.style.display=profilesEnabled?'grid':'none';profiles.style.gridTemplateColumns='minmax(0, 1fr) minmax(0, 1fr)';profiles.style.gap='8px';
 profileSelect.name='profile';profileSelect.setAttribute('aria-label','Saved profile');profileName.name='profileName';profileName.placeholder='Profile name';profileName.setAttribute('aria-label','Profile name');profileName.maxLength=120;profileName.autocomplete='off';
 for(const control of [profileSelect,profileName,profileSave,profileDelete]){control.style.border='0';control.style.borderRadius='8px';control.style.background='var(--ui-bg, #f4f1f8)';control.style.padding='8px 10px';control.style.minWidth='0';}
 profileSave.type=profileDelete.type='button';profileStatus.setAttribute('aria-live','polite');profileStatus.style.gridColumn='1 / -1';profileStatus.style.margin='0';profiles.append(profileSelect,profileName,profileSave,profileDelete,profileStatus);
 const review=element('section'),reviewTitle=element('h3','Server key'),server=element('p'),fingerprint=element('code'),previous=element('p'),explanation=element('p','Check this fingerprint with your server administrator before approving it.'),approvalLabel=element('label'),approval=element('input');approval.type='checkbox';approvalLabel.append(approval,document.createTextNode(' I recognize this server key'));fingerprint.style.overflowWrap='anywhere';fingerprint.style.display='block';review.append(reviewTitle,server,fingerprint,previous,explanation,approvalLabel);review.hidden=true;
 const remembered=element('p'),rememberLabel=element('label'),remember=element('input'),rememberText=document.createTextNode(' Remember this server key on this device');remember.type='checkbox';remember.name='rememberHost';remembered.id='sftpRememberedKey';rememberLabel.append(remember,rememberText);review.append(remembered,rememberLabel);rememberLabel.hidden=true;const forgetKey=element('button','Forget saved key','button');forgetKey.type='button';forgetKey.id='sftpForgetHost';forgetKey.style.border='0';forgetKey.hidden=true;review.append(forgetKey);
 const status=element('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');const error=element('p');error.setAttribute('role','alert');error.style.color='var(--ui-changed)';
 const footer=element('footer'),cancel=element('button','Cancel','button'),submit=element('button','Review server key','button primary');cancel.type='button';submit.type='submit';footer.style.display='flex';footer.style.gap='8px';footer.style.marginTop='16px';footer.append(cancel,submit);form.append(profiles,fields,review,status,error,footer);dialog.append(header,description,form);document.body.append(dialog);
 let active=null;
 const current=state=>active===state&&!state.closed&&isCurrent(state.context)!==false;
 const clearSecret=()=>{inputs.password.value='';passphrase.value='';};
 const discardKey=async(state,keyId)=>{if(keyId)try{await desktop.discardSftpKey(state.context.sessionId,keyId);}catch{notify('The selected key could not be cleared. Close the session to release it.');}};
 const clearKey=state=>{const keyId=state.keyId;state.keyId=null;state.keyName='';if(active===state)keyName.textContent='No key selected';void discardKey(state,keyId);};
 const cleanup=async state=>{
  const attempt=state.attemptId,connection=state.connectionId;state.attemptId=null;state.connectionId=null;
  const results=await Promise.allSettled([attempt?desktop.cancelSftp(state.context.sessionId,attempt):Promise.resolve(),connection?desktop.disconnectSftp(state.context.sessionId,connection):Promise.resolve()]);
  if(results.some(result=>result.status==='rejected'))notify('The connection could not be cleaned up. Close the session to disconnect.');
 };
 const finish=(state,value)=>{
  if(active!==state)return;clearKey(state);state.closed=true;active=null;clearSecret();inputs.username.value='';state.review=null;approval.checked=false;review.hidden=true;if(dialog.open)dialog.close();if(state.focus?.isConnected)state.focus.focus({preventScroll:true});state.resolve(value);
 };
 const close=()=>{const state=active;if(!state||state.committing)return;finish(state,null);void cleanup(state);};
 const assertCurrent=state=>{if(!current(state))throw Error('The folder view changed. Open Connect again.');};
 const render=state=>{
  const busy=state.busy||state.profileBusy||state.keyPicking,reviewing=!!state.review;
  profiles.hidden=!profilesEnabled||reviewing;
  for(const name of ['host','port'])inputs[name].parentElement.hidden=reviewing;
  for(const [name,input] of Object.entries(inputs))input.disabled=busy||reviewing&&['host','port'].includes(name);
  auth.disabled=chooseKey.disabled=busy||reviewing;passphrase.disabled=busy;
  const usingKey=auth.value==='key';inputs.password.parentElement.hidden=usingKey;keyField.hidden=passField.hidden=!usingKey;inputs.password.disabled=busy||usingKey;passphrase.disabled=busy||!usingKey;
  cancel.disabled=!!state.committing;approval.disabled=remember.disabled=forgetKey.disabled=busy;submit.disabled=busy||reviewing&&!approval.checked;submit.textContent=busy?'Connecting…':reviewing?'Approve and connect':'Review server key';
  const profileDisabled=busy||reviewing||state.profileLoading;
  profileSelect.disabled=profileName.disabled=profileSave.disabled=profileDisabled;profileDelete.disabled=profileDisabled||!profileSelect.value;
  review.hidden=!reviewing;
 };
 const populateProfiles=(state,selected='')=>{
  profileSelect.replaceChildren(new Option('Choose a saved profile…',''));
  for(const profile of state.profiles)profileSelect.add(new Option(profile.name,profile.id));
  profileSelect.value=selected;
 };
 const loadProfiles=async state=>{
  try{const items=await desktop.listSftpProfiles();if(!current(state))return;state.profiles=Array.isArray(items)?items:[];populateProfiles(state);profileStatus.textContent='';}
  catch{if(current(state))profileStatus.textContent='Saved profiles could not be loaded. You can still connect manually.';}
  finally{if(current(state)){state.profileLoading=false;render(state);}}
 };
 profileSelect.onchange=()=>{
  const state=active;if(!state||state.busy||state.profileBusy||state.review)return;
  const profile=state.profiles.find(item=>item.id===profileSelect.value);profileName.value=profile?.name||'';
  if(profile){for(const name of ['host','port','username','root'])inputs[name].value=String(profile[name]??'');clearSecret();clearKey(state);approval.checked=false;state.review=null;profileStatus.textContent='Profile loaded. Review the server key to connect.';}
  render(state);
 };
 const mutateProfile=async remove=>{
  const state=active;if(!state||state.busy||state.profileBusy||state.profileLoading||state.review)return;
  const selected=state.profiles.find(item=>item.id===profileSelect.value);
  if(remove&&!selected)return;
  if(!remove&&(!profileName.value.trim()||!['host','port','username','root'].every(name=>inputs[name].reportValidity()))){profileStatus.textContent='Enter a profile name and valid server details.';return;}
  const request=remove?selected.id:{...(selected?{id:selected.id}:{}),name:profileName.value.trim(),host:inputs.host.value.trim(),port:Number(inputs.port.value),username:inputs.username.value,root:inputs.root.value};
  state.profileBusy=true;profileStatus.textContent=remove?'Deleting profile…':'Saving profile…';render(state);
  try{
   const result=await (remove?desktop.removeSftpProfile(request):desktop.saveSftpProfile(request));if(!current(state))return;
   if(remove){state.profiles=state.profiles.filter(item=>item.id!==selected.id);populateProfiles(state);profileName.value='';profileStatus.textContent='Profile deleted.';}
   else{state.profiles=state.profiles.filter(item=>item.id!==result.id);state.profiles.push(result);populateProfiles(state,result.id);profileName.value=result.name;profileStatus.textContent='Profile saved. Credentials are never saved in profiles. Server keys can be remembered separately.';}
  }catch{if(current(state))profileStatus.textContent=remove?'Could not delete the profile. Try again.':'Could not save the profile. Try again.';}
  finally{if(current(state)){state.profileBusy=false;render(state);}}
 };
 profileSave.onclick=()=>{void mutateProfile(false);};profileDelete.onclick=()=>{void mutateProfile(true);};
 auth.onchange=()=>{const state=active;if(!state)return;clearSecret();clearKey(state);render(state);};
 chooseKey.onclick=async()=>{
  const state=active;if(!state||state.busy||state.profileBusy||state.keyPicking||state.review||auth.value!=='key')return;
  clearKey(state);passphrase.value='';state.keyPicking=true;render(state);error.textContent='';
  try{
   const selected=await desktop.chooseSftpKey(state.context.sessionId);
   if(!current(state)||auth.value!=='key'){await discardKey(state,selected?.keyId);if(active===state&&!current(state))finish(state,null);return;}
   if(selected){state.keyId=selected.keyId;state.keyName=selected.name;keyName.textContent=selected.name;}
  }catch{if(current(state))error.textContent='Could not open the key file. Choose another file.';}
  finally{state.keyPicking=false;if(current(state))render(state);}
 };
 forgetKey.onclick=async()=>{
  const state=active;if(!state||state.busy||!state.review?.savedFingerprint)return;
  state.busy=true;error.textContent='';render(state);
  try{
   await desktop.forgetSftpHost(state.context.sessionId,{attemptId:state.attemptId,approvalToken:state.review.approvalToken});assertCurrent(state);
   state.attemptId=null;state.review=null;approval.checked=remember.checked=false;status.textContent='Saved key forgotten. Review the server key again to connect.';
  }catch(failure){if(current(state))error.textContent=failure?.message||'Could not forget the saved key.';await cleanup(state);state.review=null;}
  finally{if(active===state){state.busy=false;render(state);}}
 };
 approval.onchange=()=>{if(active)render(active);};
 cancel.onclick=close;dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('close',()=>{if(active&&!dialog.open)close();});
 form.onsubmit=async event=>{
  event.preventDefault();const state=active;if(!state||state.busy||state.profileBusy||state.keyPicking||!form.reportValidity())return;
  state.busy=true;error.textContent='';render(state);
  try{
   assertCurrent(state);
   if(auth.value==='key'&&!state.keyId)throw Error('Choose a private key file before connecting.');
   if(!state.review){
    status.textContent='Checking the server key…';
    const attempt=await desktop.probeSftp(state.context.sessionId,{host:inputs.host.value.trim(),port:Number(inputs.port.value)},'folder-'+state.context.side);state.attemptId=attempt.attemptId;
    assertCurrent(state);
    const result=await desktop.reviewSftp(state.context.sessionId,state.attemptId);assertCurrent(state);
    if(!result||result.attemptId!==state.attemptId||typeof result.approvalToken!=='string'||!/^SHA256:[A-Za-z0-9+/]{43}$/.test(result.fingerprint))throw Error('The server key could not be reviewed. Try again.');
    state.review=result;server.textContent=result.host+':'+result.port;fingerprint.textContent=result.fingerprint;previous.hidden=!result.keyChanged;previous.textContent=result.keyChanged?'The key has changed. Previous key: '+result.previousFingerprint:'';approval.checked=false;remember.checked=false;rememberLabel.hidden=result.rememberSupported!==true;forgetKey.hidden=!result.savedFingerprint||typeof desktop.forgetSftpHost!=='function';rememberText.textContent=result.savedFingerprint&&result.keyChanged?' Replace the saved key after successful sign-in':' Remember this server key on this device';remembered.textContent=result.knownHost?'This key matches the saved key for this server.':result.savedFingerprint?'This key does not match the saved key. Verify the change before approving.':'No saved key for this server.';status.textContent='Approve the key to send your sign-in details.';
   }else{
    if(!approval.checked)throw Error('Approve the server key first.');
    if(Date.now()>=state.review.expiresAt)throw Error('The server key review expired. Review it again.');
    if(auth.value==='key'&&!state.keyId)throw Error('Choose a private key file before connecting.');
    status.textContent='Signing in…';
    const request={attemptId:state.attemptId,approvalToken:state.review.approvalToken,approved:true,...(remember.checked&&state.review.rememberSupported===true?{rememberHost:true}:{}),credentials:auth.value==='key'?{username:inputs.username.value,keyId:state.keyId,...(passphrase.value?{passphrase:passphrase.value}:{})}:{username:inputs.username.value,password:inputs.password.value}};
    state.keyId=null;state.keyName='';keyName.textContent='No key selected';clearSecret();let connection;
    try{connection=await desktop.connectSftp(state.context.sessionId,request);}finally{for(const name of ['password','passphrase','keyId'])if(name in request.credentials)request.credentials[name]='';}
    state.connectionId=connection.connectionId;state.attemptId=null;assertCurrent(state);
    status.textContent='Opening the folder…';
    const prepared=await desktop.prepareSftpAttachment(state.context.sessionId,state.context.side,state.connectionId,inputs.root.value);assertCurrent(state);
    state.committing=true;status.textContent='Selecting the folder…';render(state);
    const descriptor=await desktop.commitSftpAttachment(state.context.sessionId,prepared.attachmentId);
    state.committing=false;state.connectionId=null;finish(state,descriptor);onAttached?.(descriptor,state.context);return;
   }
  }catch(failure){
   state.committing=false;if(active===state){clearSecret();clearKey(state);}await cleanup(state);state.review=null;
   if(active!==state)return;approval.checked=false;
   if(!current(state)){finish(state,null);return;}
   status.textContent='';error.textContent=typeof failure?.message==='string'?failure.message:'Could not connect. Try again.';
  }finally{if(active===state){state.busy=false;render(state);}}
 };
 return {open({sessionId,side,endpoint}){
  if(active)throw Error('Finish the current connection first.');if(!sessionId||!['a','b'].includes(side))throw Error('Choose a folder side.');
  if(!desktop?.probeSftp||!desktop?.reviewSftp||!desktop?.connectSftp||!desktop?.prepareSftpAttachment||!desktop?.commitSftpAttachment)throw Error('SFTP connections are unavailable.');
  const context={sessionId,side};if(isCurrent(context)===false)return Promise.resolve(null);
  form.reset();inputs.host.value='';inputs.username.value='';inputs.port.value='22';inputs.root.value='/';
  // Prefill only non-secret endpoint details from the selected folder. Every
  // connection still requires fresh credentials and explicit host-key review.
  const reconnect=endpoint?.remote===true;
  if(reconnect){
   for(const [name,value] of [['host',endpoint.host],['username',endpoint.username],['root',endpoint.path]])if(typeof value==='string')inputs[name].value=value;
   if(Number.isInteger(endpoint.port)&&endpoint.port>0&&endpoint.port<=65535)inputs.port.value=String(endpoint.port);
  }
  auth.value='password';keyName.textContent='No key selected';clearSecret();status.textContent='';error.textContent='';server.textContent='';fingerprint.textContent='';previous.textContent='';title.textContent=(reconnect?'Reconnect ':'Connect ')+(side==='a'?'left':'right')+' folder';
  description.textContent=reconnect?'Sign in again to restore this folder. Your current comparison stays in place until the connection succeeds.':'Review the server key before signing in.';
  return new Promise(resolve=>{active={context,resolve,focus:document.activeElement,closed:false,busy:false,profileBusy:false,profileLoading:profilesEnabled,keyPicking:false,keyId:null,keyName:'',profiles:[],review:null,attemptId:null,connectionId:null};populateProfiles(active);profileName.value='';profileStatus.textContent=profilesEnabled?'Loading profiles…':'';render(active);dialog.showModal();if(profilesEnabled)void loadProfiles(active);(reconnect&&inputs.username.value?inputs.password:inputs.host).focus();});
 },close};
}
