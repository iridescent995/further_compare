import {createExplorerSetup} from './explorer-setup.js';
export function createShellSetup({desktop,notify}) {
  const dialog=document.createElement('dialog');dialog.id='shellSetupDialog';dialog.className='alignment-dialog';
  dialog.innerHTML=`<h2>File manager integration</h2><p id="shellSetupDescription"></p><ol><li>Right-click the first file or folder and choose <strong>Set as Left</strong>.</li><li>Right-click another item of the same type and choose <strong>Compare with Left</strong>.</li></ol><p id="shellSelectedHelp" hidden>In Finder, select two files or two folders and choose <strong>Compare Selected</strong>. Review the left and right paths, then compare or swap sides.</p><p>The left item stays selected until you replace or clear it. Comparisons open in new tabs. Existing unsaved work stays open.</p><section id="finderSetupSection" hidden><h3>Native Finder menu</h3><p>Actions appear directly in Finder’s right-click menu. Requests open a review before accessing files.</p><p id="finderSetupStatus" role="status"></p><div class="dialog-actions"><button id="finderSetupInstall" class="button primary">Enable Finder menu</button><button id="finderSetupRemove" class="button">Disable Finder menu</button><button id="finderSetupRefresh" class="button">Refresh status</button></div></section><section id="explorerSetupSection" hidden><h3>Modern Explorer menu</h3><p id="explorerSetupStatus" role="status"></p><p id="explorerRecoveryStatus" hidden></p><div class="dialog-actions"><button id="explorerSetupRefresh" class="button">Refresh status</button></div></section><h3 id="shellServicesHeading" hidden>Services fallback</h3><p id="shellSetupStatus" role="status"></p><div class="dialog-actions"><button id="shellSetupInstall" class="button primary">Enable integration</button><button id="shellSetupRemove" class="button">Remove integration</button><button id="shellSetupClose" class="button">Close</button></div>`;
  document.body.append(dialog);const $=id=>dialog.querySelector('#'+id);let busy=false;
  async function update(action='status'){
    if(busy)return;busy=true;$('shellSetupInstall').disabled=true;$('shellSetupRemove').disabled=true;
    try{
      const state=await desktop.shellIntegration(action),needsRepair=state.partial||state.stale;
      $('shellSetupStatus').textContent=state.reason||state.refreshWarning||(needsRepair?'Integration needs repair. Repair it to restore the actions for this app.':state.installed?'Integration files installed for your account.':'Not enabled.');
      $('shellSetupInstall').textContent=state.refreshWarning&&state.refreshAction==='install'?'Retry activation':needsRepair?'Repair integration':'Enable integration';
      $('shellSetupRemove').textContent=state.refreshWarning&&state.refreshAction==='uninstall'?'Retry removal':'Remove integration';
      $('shellSetupInstall').disabled=!state.supported||(state.installed&&!needsRepair&&!state.refreshWarning);
      $('shellSetupRemove').disabled=!state.supported||(!state.installed&&!state.partial&&!state.refreshWarning);
      if(action!=='status'){
        if(state.refreshWarning)notify(state.refreshWarning,true);
        else if(action==='install'&&(!state.installed||needsRepair))notify('Integration is incomplete. Repair it and try again.',true);
        else if(action==='uninstall'&&(state.installed||state.partial))notify('Integration could not be fully removed. Try again.',true);
        else notify(action==='install'?'File manager integration files installed.':'File manager integration removed.');
      }
    }catch(error){$('shellSetupStatus').textContent=error.message;$('shellSetupInstall').disabled=false;$('shellSetupRemove').disabled=false;}finally{busy=false;}
  }
  const explorerSetup=createExplorerSetup({desktop,section:$('explorerSetupSection'),notify,setExecuting:value=>{$('shellSetupClose').disabled=value;}});
  dialog.addEventListener('cancel',event=>{if(explorerSetup.executing)event.preventDefault();});
  dialog.addEventListener('close',()=>explorerSetup.close());
  const hasFinder=desktop?.platform==='darwin'&&typeof desktop.finderIntegration==='function';
  $('finderSetupSection').hidden=!hasFinder;$('shellServicesHeading').hidden=!hasFinder;
  let finderBusy=false,finderState=null;
  const finderVerified=state=>!!state&&state.status!=='unavailable'&&state.verified!==false;
  function finderControls(){
    const verified=finderVerified(finderState);
    const available=verified&&finderState?.supported&&finderState?.bundled&&!finderState?.conflict;
    $('finderSetupInstall').disabled=finderBusy||!available||(finderState.enabled&&!finderState.partial);
    $('finderSetupRemove').disabled=finderBusy||!verified||!finderState?.supported||finderState?.conflict||((!finderState.registered||finderState.disabled)&&!finderState.enabled&&!finderState.partial);
    $('finderSetupRefresh').disabled=finderBusy;
    $('finderSetupInstall').textContent=finderState?.partial?'Repair Finder menu':'Enable Finder menu';
  }
  async function updateFinder(action='status'){
    if(!hasFinder||finderBusy)return;finderBusy=true;finderControls();
    try{
      finderState=await desktop.finderIntegration(action);
      const state=finderState;
      const message=state.reason||(!finderVerified(state)?'Could not verify the Finder extension. Refresh its status before making changes.':!state.supported?'Native Finder menus are unavailable on this system.':!state.bundled?'This app does not include the native Finder extension.':state.partial?'Finder menu setup is incomplete. Repair it, then refresh the status.':state.enabled?'Enabled in macOS. Finder may need its Extensions setting refreshed before the menu appears.':state.disabled?'Finder extension is disabled in macOS.':state.registered?'Extension registered. If the menu is missing, enable Further Compare in macOS Settings → Extensions → Finder, then refresh status.':'Native Finder menu is not enabled.');
      $('finderSetupStatus').textContent=message;
      if(action!=='status'){
        const complete=finderVerified(state)&&state.supported&&!state.conflict&&(action==='install'?state.enabled&&!state.partial:(!state.registered||state.disabled)&&!state.enabled&&!state.partial);
        notify(complete?(action==='install'?'Finder extension enabled in macOS.':'Native Finder menu disabled.'):message,!complete);
      }
    }catch(error){finderState=null;$('finderSetupStatus').textContent=error.message||'Could not check the native Finder menu.';if(action!=='status')notify($('finderSetupStatus').textContent,true);}
    finally{finderBusy=false;finderControls();}
  }
  $('finderSetupInstall').onclick=()=>updateFinder('install');$('finderSetupRemove').onclick=()=>updateFinder('uninstall');$('finderSetupRefresh').onclick=()=>updateFinder();
  $('shellSetupInstall').onclick=()=>update('install');$('shellSetupRemove').onclick=()=>update('uninstall');$('shellSetupClose').onclick=()=>{if(!explorerSetup.executing)dialog.close();};
  return {async open(){if(!desktop?.shellIntegration)return;document.querySelectorAll('.menu[open]').forEach(menu=>menu.open=false);$('shellSelectedHelp').hidden=desktop.platform!=='darwin';$('shellSetupDescription').textContent=hasFinder?'Choose the native Finder right-click menu or the Services fallback below. Keep this app in a permanent location before enabling.':desktop.platform==='darwin'?'Adds Further Compare actions to Finder’s Quick Actions / Services menu. If they are hidden, enable them in macOS Keyboard Shortcuts → Services. Keep this app in a permanent location before enabling.':'Adds a Further Compare submenu to File Explorer for files and folders. On Windows 11, look under Show more options. Keep this app in a permanent location before enabling.';dialog.showModal();await Promise.all([update(),updateFinder(),explorerSetup.open()]);}};
}
