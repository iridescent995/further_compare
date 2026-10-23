const PAGE_SIZE = 25;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function bytes(value) {
  return typeof value === 'string' && /^\d+$/.test(value) ? `${BigInt(value).toLocaleString()} bytes` : 'Unavailable';
}

function dateValue(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return element('span', 'Unavailable');
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return element('span', 'Unavailable');
  const wrapper = element('div');
  const time = element('time', date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' }));
  time.dateTime = date.toISOString();
  const precision = element('details');
  precision.append(element('summary', 'Exact time (UTC)'), element('code', date.toISOString()));
  wrapper.append(time, precision);
  return wrapper;
}

function available(value) {
  return value === undefined || value === null || value === '' ? 'Unavailable' : String(value);
}

export function createFolderPropertiesDialog() {
  const dialog = element('dialog');
  dialog.id = 'folderPropertiesDialog';
  dialog.className = 'alignment-dialog';
  dialog.setAttribute('aria-label', 'File and folder properties');
  const heading = element('h2', 'File and folder properties');
  const summary = element('p'); summary.id = 'folderPropertiesSummary';
  const note = element('p', 'Read-only properties. Totals include selected files only. Folder contents are scanned only when you choose Calculate folder size. Sizes count file bytes, not disk allocation. Each scan is limited to 50,000 entries or 10 seconds; links and special files are skipped. Times use your local time zone; exact UTC times are available below.', 'folder-properties-note');
  const localNote=note.textContent;
  const entries = element('div'); entries.id = 'folderPropertiesEntries';
  const pagination = element('nav'); pagination.setAttribute('aria-label', 'Properties pages');
  const previous = element('button', 'Previous', 'button'); previous.id = 'folderPropertiesPrevious'; previous.type = 'button';
  const pageLabel = element('span'); pageLabel.id = 'folderPropertiesPage'; pageLabel.setAttribute('role', 'status');
  const next = element('button', 'Next', 'button'); next.id = 'folderPropertiesNext'; next.type = 'button';
  pagination.append(previous, pageLabel, next);
  const actions = element('div', undefined, 'dialog-actions');
  const close = element('button', 'Close', 'button primary'); close.id = 'folderPropertiesClose'; close.type = 'button';
  actions.append(close);
  dialog.append(heading, summary, note, pagination, entries, actions);
  document.body.append(dialog);
  let result = null, page = 0, resolveOpen = null, returnFocus = null, calculateSize = null, cancelSize = null;

  function addField(list, label, value) {
    const description = element('dd');
    if (value instanceof Node) description.append(value);
    else description.textContent = value;
    list.append(element('dt', label), description);
  }

  function render() {
    entries.replaceChildren();
    const start = page * PAGE_SIZE;
    for (const entry of result.entries.slice(start, start + PAGE_SIZE)) {
      const article = element('article'); article.dataset.path = entry.path;
      article.append(element('h3', entry.name));
      const list = element('dl');
      addField(list, 'Relative path', entry.path);
      addField(list, 'Absolute path', entry.absolutePath);
      addField(list, 'Type', entry.kind === 'directory' ? 'Folder' : 'File');
      if(entry.kind==='directory'&&calculateSize){
        const container=element('div'),value=element('span',entry.sizePending?'Calculating…':entry.folderSizeText||'Not calculated (folder contents not scanned)','folder-size-value'),button=element('button','Calculate folder size','button');button.type='button';button.disabled=Boolean(entry.sizePending);button.setAttribute('aria-label','Calculate folder size for '+entry.path);
        button.onclick=async()=>{const request=result;entry.sizePending=true;button.disabled=true;value.textContent='Calculating…';try{const size=await calculateSize(entry);if(result!==request||!dialog.open)return;entry.folderSizeText=`${size.complete?'':'Partial: '}${bytes(size.sizeBytes)} · ${size.files} ${size.files===1?'file':'files'} · ${size.folders} ${size.folders===1?'folder':'folders'}${size.skipped?' · '+size.skipped+' links or special entries skipped':''}${size.limited?' · scan limit reached':''}`;value.textContent=entry.folderSizeText;}catch(error){if(result===request&&dialog.open){entry.folderSizeText=error.message;value.textContent=error.message;}}finally{entry.sizePending=false;button.disabled=false;if(result===request&&dialog.open){const visible=[...entries.children].find(article=>article.dataset.path===entry.path);if(visible){visible.querySelector('.folder-size-value').textContent=entry.folderSizeText||'Not calculated';visible.querySelector('button').disabled=false;}}}};
        container.append(value,document.createTextNode(' '),button);addField(list,'Size',container);
      }else addField(list,'Size',entry.kind==='directory'?'Not calculated (folder contents not scanned)':bytes(entry.sizeBytes));
      addField(list, 'Modified', dateValue(entry.modifiedMs));
      addField(list, 'Accessed', dateValue(entry.accessedMs));
      addField(list, 'Created', dateValue(entry.createdMs));
      addField(list, 'POSIX permissions', available(entry.permissions));
      addField(list, 'Mode', typeof entry.mode === 'number' && Number.isInteger(entry.mode) ? `0${(entry.mode & 0o7777).toString(8).padStart(3, '0')}` : available(entry.mode));
      addField(list, 'Owner ID', available(entry.ownerId));
      addField(list, 'Group ID', available(entry.groupId));
      article.append(list); entries.append(article);
    }
    const pages = Math.max(1, Math.ceil(result.entries.length / PAGE_SIZE));
    pageLabel.textContent = `Page ${page + 1} of ${pages} · ${result.entries.length ? start + 1 : 0}–${Math.min(start + PAGE_SIZE, result.entries.length)} of ${result.entries.length} entries`;
    previous.disabled = page === 0;
    next.disabled = page + 1 >= pages;
  }

  function finish() {
    const resolve = resolveOpen;
    resolveOpen = null;
    result = null;
    const cancel=cancelSize;cancelSize=null;Promise.resolve().then(()=>cancel?.()).catch(()=>{});
    const focus = returnFocus; returnFocus = null;
    if (focus?.isConnected) focus.focus({ preventScroll: true });
    resolve?.();
  }
  dialog.addEventListener('close', finish);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  close.onclick = () => dialog.close();
  previous.onclick = () => { if (page > 0) { page--; render(); if (previous.disabled) next.focus(); } };
  next.onclick = () => { if ((page + 1) * PAGE_SIZE < result.entries.length) { page++; render(); if (next.disabled) previous.focus(); } };

  return { open(value,onCalculateSize=null,onCancelSize=null) {
    if (dialog.open || resolveOpen) throw Error('Close the current properties dialog first.');
    result = value; page = 0; calculateSize=onCalculateSize;cancelSize=onCancelSize;
    note.textContent=value.remote?(value.canCalculateSize===false?'Read-only server metadata. Totals include selected files only; folder contents are not scanned. Access and creation times are unavailable. Times use your local time zone; exact UTC times are available below.':'Read-only server metadata. Totals include selected files only. Calculate folder size scans descendant metadata without downloading file contents. Scans are limited to 50,000 entries, 5,000 folders, 256 levels or 10 seconds; links and special files are skipped. Close this dialog to cancel. Access and creation times are unavailable. Times use your local time zone; exact UTC times are available below.'):value.canCalculateSize===false?'Read-only properties. Totals include selected files only; folder contents are not scanned. Times use your local time zone; exact UTC times are available below.':localNote;
    summary.textContent = `${value.side === 'a' ? 'Left' : 'Right'} selection · ${value.files} ${value.files === 1 ? 'file' : 'files'} · ${value.folders} ${value.folders === 1 ? 'folder' : 'folders'} · Selected file total: ${bytes(value.totalFileBytes)}`;
    render();
    returnFocus = document.activeElement;
    return new Promise((resolve, reject) => {
      resolveOpen = resolve;
      try { dialog.showModal(); close.focus(); }
      catch (error) { resolveOpen = null; returnFocus = null; result = null; reject(error); }
    });
  } };
}
