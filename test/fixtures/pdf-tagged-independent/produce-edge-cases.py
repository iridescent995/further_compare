"""Original authored ODF cases, independently exported by LibreOffice Writer."""
import ast,pathlib,tempfile,subprocess,os,json
root=pathlib.Path(__file__).parent
syntax=ast.parse((root/'produce.py').read_text());base=next(ast.literal_eval(n.value)for n in syntax.body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='fodt'for t in n.targets))
base=base.replace('<office:document ','<office:document xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ')
base=base.replace('</office:styles>','<style:style style:name="Bold" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style></office:styles>')
def cell(text):return '<table:table-cell office:value-type="string"><text:p>'+text+'</text:p></table:table-cell>'
def table(rows):return '<table:table table:name="EdgeTable"><table:table-column table:number-columns-repeated="2"/>'+''.join('<table:table-row>'+row+'</table:table-row>'for row in rows)+'</table:table>'
cases={
 'empty-cell-table':table([cell('')+cell('Right only'),cell('Left only')+cell(''),cell('')+cell('')]),
 'spanning-table':table(['<table:table-cell office:value-type="string" table:number-columns-spanned="2"><text:p>Spanning heading</text:p></table:table-cell><table:covered-table-cell/>',cell('Left')+cell('Right')]),
 'nested-table':table([cell('Outer left')+'<table:table-cell>'+table([cell('Inner left')+cell('Inner right')])+'<text:p>Outer tail</text:p></table:table-cell>']),
 'inline-styles':'<text:p>Prefix <text:span text:style-name="Bold">bold Café</text:span> suffix Ω.</text:p><text:p>Line one<text:line-break/>line two.</text:p>'
}
with tempfile.TemporaryDirectory(prefix='fc-tagged-edges-')as temp:
 for name,body in cases.items():
  value=base[:base.index('<office:body>')]+'<office:body><office:text>'+body+'</office:text></office:body></office:document>'
  file=pathlib.Path(temp)/(name+'.fodt');file.write_text(value)
  subprocess.run([os.environ.get('FC_SOFFICE','soffice'),'--headless','--convert-to','pdf:writer_pdf_Export:'+json.dumps({'UseTaggedPDF':{'type':'boolean','value':'true'}}),'--outdir',str(root),str(file)],check=True)
(root/'edge-expected.json').write_text(json.dumps({'emptyCells':[['','Right only'],['Left only',''],['','']],'spanningRows':[['Spanning heading'],['Left','Right']],'nestedText':['Outer left','Inner left','Inner right','Outer tail'],'inlineParagraphs':['Prefix bold Café suffix Ω.','Line one\nline two.']},ensure_ascii=False,indent=2)+'\n')
