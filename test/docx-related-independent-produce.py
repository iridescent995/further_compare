"""Original authored Flat ODF -> real LibreOffice DOCX; no product writer."""
import pathlib,tempfile,subprocess,os
root=pathlib.Path(__file__).parent/'fixtures/docx-related-independent'
source='''<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:styles><style:style style:name="Standard" style:family="paragraph"/></office:styles>
<office:automatic-styles><style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin="2cm"/></style:page-layout><style:style style:name="Start" style:family="paragraph" style:master-page-name="First"/><style:style style:name="SecondStart" style:family="paragraph" style:master-page-name="Second"><style:paragraph-properties fo:break-before="page"/></style:style></office:automatic-styles>
<office:master-styles><style:master-page style:name="First" style:page-layout-name="Page"><style:header><text:p>Header Café HEADER</text:p></style:header><style:footer><text:p>Footer Ω FOOTER</text:p></style:footer></style:master-page><style:master-page style:name="Second" style:page-layout-name="Page"><style:header><text:p>Second header shared meaning</text:p></style:header><style:footer><text:p>Second footer</text:p></style:footer></style:master-page></office:master-styles>
<office:body><office:text><text:p text:style-name="Start">Body alpha<text:note text:id="ftn1" text:note-class="footnote"><text:note-citation>1</text:note-citation><text:note-body><text:p>Footnote 中 FOOTNOTE</text:p></text:note-body></text:note> middle<text:note text:id="en1" text:note-class="endnote"><text:note-citation>i</text:note-citation><text:note-body><text:p>Endnote ENDNOTE</text:p></text:note-body></text:note> omega.</text:p><text:p text:style-name="SecondStart">Body second section.</text:p><text:p>Body final.</text:p></office:text></office:body></office:document>'''
with tempfile.TemporaryDirectory(prefix='fc-docx-related-') as temp:
 for name,word in [('baseline','original'),('changed','changed')]:
  value=source
  for token in ['HEADER','FOOTER','FOOTNOTE','ENDNOTE']:value=value.replace(token,word)
  file=pathlib.Path(temp)/(name+'.fodt');file.write_text(value)
  subprocess.run([os.environ.get('FC_SOFFICE','soffice'),'--headless','--convert-to','docx','--outdir',str(root),str(file)],check=True)
