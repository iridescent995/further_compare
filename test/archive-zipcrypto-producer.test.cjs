'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const legacy = require('./fixtures/archive-zipcrypto-independent.json');
const mixed = require('./fixtures/archive-encryption-mixed-independent.json');

test('independent legacy fixtures retain exact archive and content checksums', () => {
  for (const manifest of [legacy,mixed]) for (const fixture of Object.values(manifest.archives)) {
    assert.equal(createHash('sha256').update(Buffer.from(fixture.data,'base64')).digest('hex'),fixture.sha256);
    for (const entry of fixture.entries) assert.equal(createHash('sha256').update(Buffer.from(entry.content,'base64')).digest('hex'),entry.contentSha256);
  }
});

test('Python zipfile independently verifies legacy payloads and proves wrong candidates pass header but fail full decoding', () => {
  const python = process.env.FC_ARCHIVE_PYTHON || 'python3';
  const script = String.raw`
import base64, hashlib, io, json, struct, sys, zipfile, zlib
reads = false_headers = 0
for filename in sys.argv[1:]:
    manifest = json.load(open(filename))
    for archive in manifest['archives'].values():
        data = base64.b64decode(archive['data'])
        with zipfile.ZipFile(io.BytesIO(data)) as reader:
            for entry in archive['entries']:
                if entry.get('encryptionType') == 'aes':
                    continue
                password = entry['password']
                output = reader.read(entry['name'], pwd=password.encode('utf-8') if password is not None else None)
                assert hashlib.sha256(output).hexdigest() == entry['contentSha256']
                reads += 1
                wrong = entry.get('wrongHeaderPassword')
                if not wrong:
                    continue
                info = reader.getinfo(entry['name'])
                offset = info.header_offset
                name_length, extra_length = struct.unpack_from('<HH', data, offset + 26)
                start = offset + 30 + name_length + extra_length
                header = zipfile._ZipDecrypter(wrong.encode())(data[start:start+12])
                check = (struct.unpack_from('<H',data,offset+10)[0] >> 8) if info.flag_bits & 8 else info.CRC >> 24
                assert header[-1] == check, 'Candidate must pass header byte check'
                try:
                    reader.read(entry['name'],pwd=wrong.encode())
                except (zipfile.BadZipFile,zlib.error):
                    false_headers += 1
                else:
                    raise AssertionError('Candidate did not fail full content check')
print(json.dumps(dict(reads=reads,falseHeaders=false_headers)))
`;
  const result = JSON.parse(execFileSync(python,['-c',script,path.join(__dirname,'fixtures/archive-zipcrypto-independent.json'),path.join(__dirname,'fixtures/archive-encryption-mixed-independent.json')],{encoding:'utf8',timeout:30000}));
  assert.deepEqual(result,{reads:18,falseHeaders:10});
});
