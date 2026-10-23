"""Independent fixtures from Python's standard ZIP writer, including streamed descriptors."""
import io, pathlib, sys, zipfile
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
entries = {'nested/hello.txt': b'ZIP64 content\n', 'different.txt': b'original content', 'empty.txt': b''}
class Stream(io.BytesIO):
    def seekable(self): return False
    def seek(self, *args): raise io.UnsupportedOperation('streaming writer')
for name, mode, force_local, force_all, streaming in [
    ('classic.zip', zipfile.ZIP_STORED, False, False, False),
    ('local64.zip', zipfile.ZIP_STORED, True, False, False),
    ('full64.zip', zipfile.ZIP_DEFLATED, True, True, False),
    ('stream64.zip', zipfile.ZIP_DEFLATED, True, True, True),
]:
    previous = zipfile.ZIP64_LIMIT
    if force_all: zipfile.ZIP64_LIMIT = 0
    buf = Stream() if streaming else io.BytesIO()
    try:
        with zipfile.ZipFile(buf, 'w', compression=mode, allowZip64=True) as z:
            for path, data in entries.items():
                if force_local:
                    with z.open(path, 'w', force_zip64=True) as f: f.write(data)
                else: z.writestr(path, data)
        content = buf.getvalue(); (out / name).write_bytes(content)
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            assert {path: z.read(path) for path in z.namelist()} == entries
        if force_all: assert b'PK\x06\x06' in content and b'PK\x06\x07' in content
        if streaming: assert b'PK\x07\x08' in content
    finally: zipfile.ZIP64_LIMIT = previous
