const labels = { 'mac-arm64': 'Apple silicon', 'mac-x64': 'Intel Mac', 'windows-x64': 'Windows 64-bit' };
async function loadDownloads() {
  const status = document.querySelector('#download-status');
  try {
    const response = await fetch('downloads/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Build manifest unavailable');
    const manifest = await response.json();
    let available = 0;
    for (const link of document.querySelectorAll('[data-build]')) {
      const key = link.dataset.build;
      const entry = manifest[key] || manifest.downloads?.[key];
      if (!entry || typeof entry.url !== 'string' || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) continue;
      const url = new URL(entry.url, document.baseURI);
      if (!['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && url.origin !== location.origin)) continue;
      link.href = url.href;
      link.removeAttribute('aria-disabled');
      link.setAttribute('download', '');
      link.title = `SHA-256: ${entry.sha256}`;
      link.firstChild.textContent = `${labels[key]} `;
      link.querySelector('span').textContent = typeof entry.size === 'number' ? `ZIP · ${(entry.size / 1048576).toFixed(0)} MB ↓` : 'Download ZIP ↓';
      available++;
    }
    if (!available) throw new Error('No builds available');
  } catch {
    status.textContent = 'Desktop downloads are being prepared. Try the online comparator now. Preview desktop releases are unsigned portable ZIP files.';
  }
}
loadDownloads();
