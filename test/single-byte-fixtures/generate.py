"""Independent fixtures from CPython standard library codecs, no app imports."""
import json, pathlib, sys
profiles=[('cp437','cp437','Café ┌─┐'),('cp850','cp850','Straße café'),('iso8859-15','iso8859_15','€ Œ œ Ÿ'),('koi8-r','koi8_r','Привет'),('macroman','mac_roman','Café ')]
rows=[]
for name,codec,text in profiles:
    rows.append(dict(encoding=name,pythonCodec=codec,text=text+'\r\n',hex=(text+'\r\n').encode(codec).hex(),points=[ord(bytes([b]).decode(codec)) for b in range(256)]))
pathlib.Path(__file__).with_name('profiles.json').write_text(json.dumps({'producer':sys.version,'profiles':rows},ensure_ascii=True,indent=2)+'\n')
