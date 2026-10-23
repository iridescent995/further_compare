#!/usr/bin/env python3
"""Reproduce public compatibility fixtures independently of the JS codec.

Fixture-only traditional ZIP writer uses stdlib zlib/struct; Python zipfile
independently decodes every entry. Info-ZIP additionally produces descriptors.
Deterministic headers are for repeatable tests only, never production encryption.
"""
import base64
import hashlib
import io
import json
import pathlib
import struct
import subprocess
import tempfile
import zipfile
import zlib

PASSWORD = 'fixture public Ω password'
TABLE = []
for n in range(256):
    for _ in range(8):
        n = (n >> 1) ^ (0xedb88320 if n & 1 else 0)
    TABLE.append(n)


class Crypto:
    def __init__(self, password):
        self.keys = [0x12345678, 0x23456789, 0x34567890]
        for byte in password.encode('utf-8'):
            self.update(byte)

    def update(self, byte):
        self.keys[0] = (self.keys[0] >> 8) ^ TABLE[(self.keys[0] ^ byte) & 255]
        self.keys[1] = ((self.keys[1] + (self.keys[0] & 255)) * 134775813 + 1) & 0xffffffff
        self.keys[2] = (self.keys[2] >> 8) ^ TABLE[(self.keys[2] ^ (self.keys[1] >> 24)) & 255]

    def transform(self, data, decrypt=False):
        result = bytearray()
        for byte in data:
            key = self.keys[2] | 2
            output = byte ^ (((key * (key ^ 1)) >> 8) & 255)
            self.update(output if decrypt else byte)
            result.append(output)
        return bytes(result)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def make(entries):
    local = bytearray()
    central = bytearray()
    records = []
    for name, payload, method, descriptor, password in entries:
        filename = name.encode('utf-8')
        crc = zlib.crc32(payload)
        dos_time = 0x6283
        flags = 0x800 | (1 if password is not None else 0) | (8 if descriptor else 0)
        compressed = payload
        if method == 8:
            compressor = zlib.compressobj(6, zlib.DEFLATED, -15)
            compressed = compressor.compress(payload) + compressor.flush()
        check = (dos_time >> 8) if descriptor else (crc >> 24)
        if password is not None:
            header = bytes(range(11)) + bytes([check])
            compressed = Crypto(password).transform(header + compressed)
        offset = len(local)
        local += struct.pack('<I5H3I2H', 0x04034b50, 20, flags, method, dos_time, 0x5921,
                             0 if descriptor else crc, 0 if descriptor else len(compressed),
                             0 if descriptor else len(payload), len(filename), 0)
        local += filename + compressed
        if descriptor:
            local += struct.pack('<4I', 0x08074b50, crc, len(compressed), len(payload))
        central += struct.pack('<I6H3I5H2I', 0x02014b50, 20, 20, flags, method, dos_time, 0x5921,
                               crc, len(compressed), len(payload), len(filename), 0, 0, 0, 0, 0, offset)
        central += filename
        record = dict(name=name, password=password, content=base64.b64encode(payload).decode(),
                      contentSha256=digest(payload), method=method, descriptor=descriptor)
        if password is not None and payload:
            for index in range(100000):
                wrong = 'wrong-header-candidate-' + str(index)
                if Crypto(wrong).transform(compressed[:12], decrypt=True)[-1] == check:
                    record['wrongHeaderPassword'] = wrong
                    break
            else:
                raise AssertionError('No header candidate found')
        records.append(record)
    data = bytes(local + central + struct.pack('<I4H2IH', 0x06054b50, 0, 0, len(entries), len(entries),
                                               len(central), len(local), 0))
    return package(data, records, 'Python stdlib fixture writer')


def package(data, records, producer):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.namelist() == [r['name'] for r in records]
        for record in records:
            password = record['password']
            decoded = archive.read(record['name'], pwd=password.encode('utf-8') if password is not None else None)
            assert digest(decoded) == record['contentSha256']
            wrong = record.get('wrongHeaderPassword')
            if wrong:
                try:
                    archive.read(record['name'], pwd=wrong.encode())
                except (zipfile.BadZipFile, zlib.error):
                    pass  # Header passed; complete CRC/decompression rejected.
                else:
                    raise AssertionError('Wrong password unexpectedly accepted')
    return dict(data=base64.b64encode(data).decode(), sha256=digest(data), entries=records, producer=producer)


def main():
    archives = {}
    payload = ('Independent traditional ZIP fixture. Ω\n' * 96).encode()
    for descriptor in (False, True):
        for method, label in ((0, 'stored'), (8, 'deflate')):
            for empty in (False, True):
                name = ('descriptor-' if descriptor else '') + ('empty-' if empty else '') + label + '.zip'
                archives[name] = make([('text.txt', b'' if empty else payload, method, descriptor, PASSWORD)])
    archives['mixed.zip'] = make([
        ('plain.txt', b'plain', 0, False, None),
        ('folder/first.txt', b'first independently passworded file', 8, True, PASSWORD),
        ('folder/second.txt', b'second independently passworded file', 0, False, 'second password'),
        ('Unicode/\u03a9-\u6587\u4ef6.txt', 'Unicode filename and text \u03a9 \u6587\u4ef6\n'.encode(), 8, False, PASSWORD),
    ])
    with tempfile.TemporaryDirectory(prefix='fc-zipcrypto-producer-') as directory:
        root = pathlib.Path(directory)
        (root / 'text.txt').write_bytes(payload)
        for level, label in ((0, 'stored'), (9, 'deflate')):
            name = 'infozip-' + label + '.zip'
            subprocess.run(['/usr/bin/zip', '-q', '-' + str(level), '-P', 'infozip public password', name, 'text.txt'], cwd=root, check=True)
            data = (root / name).read_bytes()
            flags = struct.unpack_from('<H', data, 6)[0]
            method = struct.unpack_from('<H', data, 8)[0]
            records = [dict(name='text.txt', password='infozip public password', content=base64.b64encode(payload).decode(),
                            contentSha256=digest(payload), method=method, descriptor=bool(flags & 8))]
            archives[name] = package(data, records, 'Info-ZIP 3.0')
    result = dict(producers=['Python stdlib fixture writer', 'Info-ZIP 3.0'], independentDecoder='Python zipfile',
                  passwordEncoding='UTF-8 bytes; no locale fallback is implied', archives=archives)
    destination = pathlib.Path(__file__).parent / 'fixtures/archive-zipcrypto-independent.json'
    destination.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(dict(passed=True, archives=len(archives), entries=sum(len(a['entries']) for a in archives.values()), independentDecoder='Python zipfile')))


if __name__ == '__main__':
    main()
