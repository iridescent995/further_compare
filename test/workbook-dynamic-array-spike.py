"""Producer/reader evidence only; does not enable application metadata support."""
import sys, json, zipfile, hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
import xlsxwriter, openpyxl
out = Path(sys.argv[1] if len(sys.argv)>1 else '/private/tmp/fc-dynamic-array-spike.xlsx')
book=xlsxwriter.Workbook(out)
sheet=book.add_worksheet('Data')
for i,row in enumerate([[2,3],[4,5],[2,6]],1): sheet.write_row(i,0,row)
sheet.write_dynamic_array_formula('C2:D4','=A2:B4*2',None,4)
sheet.write_dynamic_array_formula('F2','=UNIQUE(A2:A4)',None,2)
sheet.write_formula('I2','=SUM(_xlfn.ANCHORARRAY(C2))',None,44)
other=book.add_worksheet('Other');other.write_formula('A1','=SUM(_xlfn.ANCHORARRAY(Data!C2))',None,44)
book.close()
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(out) as z:
 metadata=z.read('xl/metadata.xml');md=ET.fromstring(metadata)
 types=md.find('m:metadataTypes',ns);future=md.find('m:futureMetadata',ns);cells=md.find('m:cellMetadata',ns)
 assert types[0].attrib['name']=='XLDAPR'
 assert future.attrib['name']=='XLDAPR' and cells.attrib['count']=='1'
 assert cells[0][0].attrib=={'t':'1','v':'0'}
 props=next(n for n in future.iter() if n.tag.endswith('dynamicArrayProperties'))
 assert props.attrib=={'fDynamic':'1','fCollapsed':'0'}
 worksheet=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
 anchors=[c for c in worksheet.findall('.//m:c',ns) if 'cm' in c.attrib]
 assert [(c.attrib['r'],c.attrib['cm'],c.find('m:f',ns).attrib['ref']) for c in anchors]==[('C2','1','C2:D4'),('F2','1','F2'),('I2','1','I2')]
 assert all('vm' not in c.attrib for c in worksheet.findall('.//m:c',ns))
 formulas={c.attrib['r']:c.find('m:f',ns).text for c in worksheet.findall('.//m:c',ns) if c.find('m:f',ns) is not None}
 assert formulas['F2']=='_xlfn.UNIQUE(A2:A4)' and formulas['I2']=='SUM(_xlfn.ANCHORARRAY(C2))'
 before={name:z.read(name) for name in z.namelist()}
reader=openpyxl.load_workbook(out,data_only=False)
assert reader['Data'].array_formulae=={'C2':'C2:D4','F2':'F2','I2':'I2'}
assert reader['Data']['C2'].value.text=='=A2:B4*2'
assert reader['Data']['F2'].value.text=='=_xlfn.UNIQUE(A2:A4)'
assert reader['Other']['A1'].value.text=='=SUM(_xlfn.ANCHORARRAY(Data!C2))'
# A whole-sheet row insertion can keep every cm index unchanged. This XML-only
# proof is not a production transformer, calculation test or Excel validation.
moved=out.with_name(out.stem+'-shifted.xlsx');root=ET.fromstring(before['xl/worksheets/sheet1.xml'])
for row in root.findall('.//m:row',ns):
 old=int(row.attrib['r']);row.attrib['r']=str(old+1);row.attrib.pop('spans',None)
 for c in row.findall('m:c',ns):
  address=c.attrib['r'];letters=address.rstrip('0123456789');c.attrib['r']=letters+str(int(address[len(letters):])+1)
  f=c.find('m:f',ns)
  if f is not None:
   if f.attrib.get('ref')=='C2:D4': f.attrib['ref']='C3:D5';f.text='A3:B5*2'
   elif f.attrib.get('ref')=='F2': f.attrib['ref']='F3';f.text='_xlfn.UNIQUE(A3:A5)'
   else:f.attrib['ref']='I3';f.text='SUM(_xlfn.ANCHORARRAY(C3))'
  for value in list(c):
   if value.tag.endswith('}v') and (letters in ['C','D'] or address in ['F2','I2']):c.remove(value)
root.find('m:dimension',ns).set('ref','A3:I5')
otherxml=ET.fromstring(before['xl/worksheets/sheet2.xml']);otherxml.find('.//m:f',ns).text='SUM(_xlfn.ANCHORARRAY(Data!C3))'
for c in otherxml.findall('.//m:c',ns):
 for v in list(c):
  if v.tag.endswith('}v'):c.remove(v)
with zipfile.ZipFile(moved,'w',zipfile.ZIP_DEFLATED) as z:
 for name,data in before.items():z.writestr(name,ET.tostring(root) if name=='xl/worksheets/sheet1.xml' else ET.tostring(otherxml) if name=='xl/worksheets/sheet2.xml' else data)
with zipfile.ZipFile(moved) as z:assert z.read('xl/metadata.xml')==metadata
shifted=openpyxl.load_workbook(moved,data_only=False);assert shifted['Data'].array_formulae=={'C3':'C3:D5','F3':'F3','I3':'I3'}
assert shifted['Data']['C3'].value.text=='=A3:B5*2';assert shifted['Data']['F3'].value.text=='=_xlfn.UNIQUE(A3:A5)'
print(json.dumps({'producer':'XlsxWriter '+xlsxwriter.__version__,'reader':'openpyxl '+openpyxl.__version__,'original':str(out),'shifted':str(moved),'metadataSha256':hashlib.sha256(metadata).hexdigest(),'anchors':[{**c.attrib,'formula':c.find('m:f',ns).text} for c in anchors],'independentReadPassed':True,'calculatedOrExcelValidated':False},indent=2))
