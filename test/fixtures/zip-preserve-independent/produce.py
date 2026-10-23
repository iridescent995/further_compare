"""Independent ZIP producers/oracle; no Further Compare imports."""
import io, json, pathlib, struct, zipfile, zlib, hashlib, subprocess, tempfile, os
ROOT = pathlib.Path(__file__).resolve().parent
class Unseekable(io.BytesIO):
    def seekable(self): return False
    def seek(self, *args): raise io.UnsupportedOperation('stream')
def extra(tag, value): return struct.pack('<HH', tag, len(value)) + value
def info(name, method):
    item=zipfile.ZipInfo(name, (2022, 7, 8, 9, 10, 12)); item.create_system=3
    item.compress_type=method; item.external_attr=(0o100755 if name.endswith('.sh') else 0o100640)<<16
    item.comment=('Entry '+name).encode('utf-8')
    item.extra=extra(0x5455,struct.pack('<BI',1,1657271412))
    if name.isascii():
        encoded=name.encode('ascii')
        item.extra+=extra(0x7075,b'\x01'+struct.pack('<I',zlib.crc32(encoded))+encoded)
    return item
payloads={'plain.txt':b'Original editable text\n','bin/data.bin':bytes(range(256))*16,'run.sh':b'#!/bin/sh\nprintf "hello"\n','caf\u00e9.txt':'Unicode \u03a9\n'.encode()}
for name,streamed,force64 in [('python-mixed.zip',False,False),('python-streamed.zip',True,False),('python-small-zip64.zip',False,True),('python-ntfs.zip',False,False)]:
    target=Unseekable() if streamed else io.BytesIO()
    with zipfile.ZipFile(target,'w') as out:
        out.comment=b'Independent archive comment\x00binary'
        for index,(entry,data) in enumerate(payloads.items()):
            metadata=info(entry,zipfile.ZIP_STORED if index%2==0 else zipfile.ZIP_DEFLATED)
            if name=='python-ntfs.zip':
                ticks=116444736000000000+1657271412*10000000
                metadata.extra+=extra(0x000a,struct.pack('<IHHQQQ',0,1,24,ticks,ticks-10000000,ticks-20000000))
            with out.open(metadata,'w',force_zip64=force64) as dest: dest.write(data)
    (ROOT/name).write_bytes(target.getvalue())
with tempfile.TemporaryDirectory() as tmp:
    work=pathlib.Path(tmp); (work/'readme.txt').write_bytes(b'Info-ZIP independently produced\n'); (work/'executable.sh').write_bytes(payloads['run.sh'])
    os.chmod(work/'executable.sh',0o755)
    for file in work.iterdir(): os.utime(file,(1657271412,1657271412))
    output=work/'infozip.zip'
    subprocess.run(['/usr/bin/zip','-q',str(output),'readme.txt','executable.sh'],cwd=work,check=True)
    (ROOT/'infozip.zip').write_bytes(output.read_bytes())
def inspect(file):
    raw=file.read_bytes(); entries=[]
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None
        for item in archive.infolist():
            offset=item.header_offset; name_len,extra_len=struct.unpack_from('<HH',raw,offset+26)
            start=offset+30+name_len+extra_len
            entries.append(dict(rawLocalTimestamp=raw[offset+10:offset+14].hex(),rawLocalExtra=raw[offset+30+name_len:start].hex(),name=item.filename,method=item.compress_type,flags=item.flag_bits,comment=item.comment.hex(),extra=item.extra.hex(),externalAttributes=item.external_attr,internalAttributes=item.internal_attr,createSystem=item.create_system,createVersion=item.create_version,extractVersion=item.extract_version,dateTime=list(item.date_time),crc=item.CRC,size=item.file_size,compressedSize=item.compress_size,payloadSha256=hashlib.sha256(archive.read(item)).hexdigest(),compressedSha256=hashlib.sha256(raw[start:start+item.compress_size]).hexdigest()))
        return dict(sha256=hashlib.sha256(raw).hexdigest(),comment=archive.comment.hex(),entries=entries)
if __name__=='__main__':
    (ROOT/'expected.json').write_text(json.dumps({file.name:inspect(file) for file in sorted(ROOT.glob('*.zip'))},indent=2)+'\n')
    print('Independent ZIP fixtures and Python readback written.')
