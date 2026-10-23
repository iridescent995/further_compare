"""Read a ZIP using Python standard library, independently of application code."""
import json, pathlib, struct, zipfile, hashlib, sys
def inspect(file):
    raw=file.read_bytes(); entries=[]
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None
        for item in archive.infolist():
            offset=item.header_offset; name_len,extra_len=struct.unpack_from('<HH',raw,offset+26)
            start=offset+30+name_len+extra_len
            entries.append(dict(rawLocalTimestamp=raw[offset+10:offset+14].hex(),rawLocalExtra=raw[offset+30+name_len:start].hex(),name=item.filename,method=item.compress_type,flags=item.flag_bits,comment=item.comment.hex(),extra=item.extra.hex(),externalAttributes=item.external_attr,internalAttributes=item.internal_attr,createSystem=item.create_system,createVersion=item.create_version,extractVersion=item.extract_version,dateTime=list(item.date_time),crc=item.CRC,size=item.file_size,compressedSize=item.compress_size,payloadSha256=hashlib.sha256(archive.read(item)).hexdigest(),compressedSha256=hashlib.sha256(raw[start:start+item.compress_size]).hexdigest()))
        return dict(sha256=hashlib.sha256(raw).hexdigest(),comment=archive.comment.hex(),entries=entries)

if __name__ == '__main__':
    print(json.dumps(inspect(pathlib.Path(sys.argv[1]))))
