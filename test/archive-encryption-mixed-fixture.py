#!/usr/bin/env python3
"""Join existing independent encrypted entries without changing ciphertext.

Needs pyzipper 0.3.6 to verify all AES/ZipCrypto/plain entries independently.
Example: PYTHONPATH=/private/tmp/fc-aes-spike/python python3 this-file.py
"""
import base64
import hashlib
import io
import json
import pathlib
import struct
import pyzipper

root = pathlib.Path(__file__).parent / 'fixtures'
legacy = json.loads((root / 'archive-zipcrypto-independent.json').read_text())['archives']['mixed.zip']
aes_manifest = json.loads((root / 'archive-aes-independent.json').read_text())
aes = aes_manifest['archives']['ae2-256-8.zip']
locals_ = bytearray()
centrals = bytearray()
count = 0
for source in (legacy, aes):
    data = base64.b64decode(source['data'])
    assert hashlib.sha256(data).hexdigest() == source['sha256']
    eocd = data.rfind(b'PK\x05\x06')
    entry_count = struct.unpack_from('<H', data, eocd + 10)[0]
    central_size, central_offset = struct.unpack_from('<II', data, eocd + 12)
    assert central_offset + central_size == eocd and eocd + 22 == len(data)
    central = bytearray(data[central_offset:eocd])
    cursor = 0
    for _ in range(entry_count):
        assert central[cursor:cursor + 4] == b'PK\x01\x02'
        struct.pack_into('<I', central, cursor + 42, struct.unpack_from('<I', central, cursor + 42)[0] + len(locals_))
        name, extra, comment = struct.unpack_from('<HHH', central, cursor + 28)
        cursor += 46 + name + extra + comment
    assert cursor == len(central)
    locals_ += data[:central_offset]
    centrals += central
    count += entry_count
combined = bytes(locals_ + centrals + struct.pack('<I4H2IH',0x06054b50,0,0,count,count,len(centrals),len(locals_),0))
entries = [{**entry, 'encryptionType':'zipcrypto' if entry['password'] is not None else None} for entry in legacy['entries']]
payload = ('Authenticated Ω text\n' * 100).encode()
entries.append(dict(name='text.txt',password=aes_manifest['password'],content=base64.b64encode(payload).decode(),contentSha256=hashlib.sha256(payload).hexdigest(),method=8,descriptor=False,encryptionType='aes'))
with pyzipper.AESZipFile(io.BytesIO(combined)) as archive:
    assert archive.namelist() == [entry['name'] for entry in entries]
    for entry in entries:
        password = entry['password']
        output = archive.read(entry['name'],pwd=password.encode('utf-8') if password is not None else None)
        assert hashlib.sha256(output).hexdigest() == entry['contentSha256']
result = dict(producers=['Python stdlib fixture writer','pyzipper 0.3.6'],independentDecoder='pyzipper 0.3.6',archives={'mixed-aes-legacy.zip':dict(data=base64.b64encode(combined).decode(),sha256=hashlib.sha256(combined).hexdigest(),entries=entries,producer='Ciphertext-preserving concatenation of independent fixtures')})
(root / 'archive-encryption-mixed-independent.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print(json.dumps(dict(passed=True,entries=len(entries),independentDecoder='pyzipper 0.3.6',ciphertextPreserved=True)))
