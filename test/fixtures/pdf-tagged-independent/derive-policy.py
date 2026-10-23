"""Test-only adversarial derivatives; preserves the original LO fixtures."""
import pathlib,re
from pypdf import PdfReader,PdfWriter
from pypdf.generic import DecodedStreamObject,NameObject,DictionaryObject,ArrayObject,NumberObject
root=pathlib.Path(__file__).parent
r=PdfReader(root/'baseline.pdf');raw=r.pages[0].get_contents().get_data()
pattern=rb'/[^\s/]+\s*<<\s*/MCID\s+(\d+)\s*>>\s*BDC\s*.*?\bEMC\b'
blocks={int(m[1]):m[0]for m in re.finditer(pattern,raw,re.S)}
def write(name,change,form=False):
 w=PdfWriter();w.clone_document_from_reader(r)
 if form:
  f=DecodedStreamObject();f.set_data(blocks[1]);f.update({NameObject('/Type'):NameObject('/XObject'),NameObject('/Subtype'):NameObject('/Form'),NameObject('/BBox'):ArrayObject([NumberObject(x)for x in [0,0,595,842]]),NameObject('/Resources'):w.pages[0]['/Resources']})
  w.pages[0]['/Resources'][NameObject('/XObject')]=DictionaryObject({NameObject('/Repeated'):w._add_object(f)})
 s=DecodedStreamObject();s.set_data(change);w.pages[0][NameObject('/Contents')]=w._add_object(s)
 with(root/(name+'.pdf')).open('wb')as f:w.write(f)
# Font F2 code05 maps to U+0020. These are actual encoded spaces, not geometry gaps.
spaced=blocks[1].replace(b'Tf[',b'Tf[<05>').replace(b']TJ',b'<05>]TJ')
write('authored-edge-spaces',raw.replace(blocks[1],spaced))
# Same Form drawn twice: duplicate MCID identities must not be silently merged.
write('reused-form-mcid',raw.replace(blocks[1],b'/Repeated Do\n/Repeated Do'),True)

standalone=blocks[1].replace(b'Tf[',b'Tf <05> Tj [').replace(b']TJ',b']TJ <05> Tj')
write('authored-standalone-spaces',raw.replace(blocks[1],standalone))

for name in ['authored-edge-spaces','authored-standalone-spaces']:
 assert '\n Left alpha Café \n' in PdfReader(root/(name+'.pdf')).pages[0].extract_text()
# Wrapper-depth budget: no added visible text, valid balanced PDF marked content.
write('marker-depth-limit', b'/Span BMC\n'*129+raw+b'\nEMC'*129)
write('marker-depth-stream-limit', b'/Span BMC\n'*129+raw*200+b'\nEMC'*129)
