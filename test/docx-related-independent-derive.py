"""Labelled package mutations of the LibreOffice baseline, never producer claims."""
import pathlib,zipfile,re,json,xml.etree.ElementTree as E
root=pathlib.Path(__file__).parent/'fixtures/docx-related-independent'
with zipfile.ZipFile(root/'baseline.docx') as z:parts={n:z.read(n) for n in z.namelist()}
def save(name,changes):
 with zipfile.ZipFile(root/(name+'.docx'),'w',zipfile.ZIP_DEFLATED) as z:
  for n,b in parts.items():z.writestr(n,changes.get(n,b))
renamed={}
for n in ['word/document.xml','word/footnotes.xml','word/endnotes.xml']:
 s=parts[n].decode();s=re.sub(r'(<w:(?:footnote|endnote)(?:Reference)?\b[^>]*\bw:id=")2(")',r'\g<1>42\2',s);renamed[n]=s.encode()
save('renumbered',renamed)
s=parts['word/document.xml'].decode();pattern=r'<w:r\b[^>]*>(?:(?!<w:r\b).)*?<w:footnoteReference\b[^>]*/>\s*</w:r>'
m=re.search(pattern,s,re.S);assert m;s=s[:m.start()]+s[m.end():];at=s.index('Body final.');end=s.index('</w:p>',at);s=s[:end]+m[0]+s[end:];save('moved-reference',{'word/document.xml':s.encode()})
# A second surviving reference shares the same definition.
s=parts['word/document.xml'].decode();at=s.index('Body final.');end=s.index('</w:p>',at);s=s[:end]+m[0]+s[end:];save('repeated-reference',{'word/document.xml':s.encode()})
# Genuine first section references persist into section two when its references are absent.
s=parts['word/document.xml'].decode();sections=list(re.finditer(r'<w:sectPr\b[^>]*>.*?</w:sectPr>',s,re.S));assert len(sections)==2
last=sections[-1];section=re.sub(r'<w:(?:header|footer)Reference\b[^>]*/>','',last[0]);s=s[:last.start()]+section+s[last.end():];save('inherited',{'word/document.xml':s.encode()})
# Primary expected text and story data authored independently; XML names checked here.
w='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
expected={'main':'Body alpha middle omega.\n\nBody second section.\nBody final.\n','headers':['Header Café original','Second header shared meaning'],'footers':['Footer Ω original','Second footer'],'footnote':'Footnote 中 original','endnote':'Endnote original','sections':2}
for n,text in [('word/header1.xml',expected['headers'][0]),('word/footer1.xml',expected['footers'][0]),('word/footnotes.xml',expected['footnote']),('word/endnotes.xml',expected['endnote'])]:assert ''.join(e.text or '' for e in E.fromstring(parts[n]).iter(w+'t'))==text
(root/'expected.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n')
