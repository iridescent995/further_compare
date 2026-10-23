"""Regenerate original tone fixtures with lameenc 1.9.0 (test-only dependency).
PYTHONPATH=/private/tmp/fc-mp3-encoder python3 test/mp3-fixture-generate.py
No third-party recordings are used. The encoder is not required to run tests.
"""
import base64,json,math,pathlib,struct,lameenc
fixtures={}
for name,rate,channels,freq,vbr in [('mono',32000,1,440,False),('changed',32000,1,660,False),('stereo-vbr',44100,2,330,True),('mono-22050',22050,1,550,False),('mono-11025',11025,1,275,False)]:
 encoder=lameenc.Encoder();encoder.set_in_sample_rate(rate);encoder.set_out_sample_rate(rate);encoder.set_channels(channels);encoder.set_bit_rate(32 if rate<16000 else 96);encoder.set_quality(2);encoder.silence()
 if vbr:encoder.set_vbr(lameenc.VBR_MTRH);encoder.set_vbr_quality(3)
 samples=[]
 for i in range(rate//2):
  for channel in range(channels):
   amplitude=9000 if i<rate//4 else 3000
   samples.append(round(amplitude*math.sin(2*math.pi*(freq+channel*230)*i/rate)))
 data=encoder.encode(struct.pack('<'+'h'*len(samples),*samples))+encoder.flush()
 fixtures[name]={'rate':rate,'channels':channels,'sourceFrames':rate//2,'vbr':vbr,'data':base64.b64encode(data).decode()}
pathlib.Path(__file__).with_name('mp3-fixtures.json').write_text(json.dumps(fixtures,indent=2)+'\n')
