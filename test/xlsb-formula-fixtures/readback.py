"""Read independent LibreOffice conversion using openpyxl, never product decoder."""
import openpyxl,pathlib,json,hashlib
p=pathlib.Path(__file__).parent;result={}
for base in ['issues','issue_182']:
 w=openpyxl.load_workbook(p/(base+'-libreoffice.xlsx'),data_only=False);cached=openpyxl.load_workbook(p/(base+'-libreoffice.xlsx'),data_only=True)
 result[base]={'sha256':hashlib.sha256((p/(base+'.xlsb')).read_bytes()).hexdigest(),'formulas':[{'sheet':s.title,'row':c.row-1,'column':c.column-1,'expression':c.value,'cache':cached[s.title][c.coordinate].value} for s in w for row in s for c in row if c.data_type=='f']}
(p/'independent-readback.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
