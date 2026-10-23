'use strict';
const assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
// Python's standard library supplies independent USTAR, GNU and PAX writers.
function fixture(format,entries){const result=spawnSync(process.platform==='win32'?'python':'python3',['-c',`import io,json,sys,tarfile
req=json.load(sys.stdin)
out=io.BytesIO()
with tarfile.open(fileobj=out,mode='w',format=getattr(tarfile,req['format']+'_FORMAT')) as archive:
 for entry in req['entries']:
  info=tarfile.TarInfo(entry['name']);info.mtime=entry.get('mtime',1720000000)
  data=entry.get('data','').encode('utf-8');info.size=len(data)
  if entry.get('directory'):info.type=tarfile.DIRTYPE;info.size=0
  if entry.get('link'):info.type=tarfile.SYMTYPE;info.linkname='target';info.size=0
  if entry.get('pax'):info.pax_headers=entry['pax']
  archive.addfile(info,io.BytesIO(data))
sys.stdout.buffer.write(out.getvalue())`],{input:JSON.stringify({format,entries}),maxBuffer:4*1024*1024});assert.equal(result.status,0,result.stderr.toString());return result.stdout;}
module.exports={tar:fixture};
