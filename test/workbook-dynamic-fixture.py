"""Independent XlsxWriter producer/openpyxl reader; no formula calculation claims."""
import sys,json,datetime,zipfile
from pathlib import Path
import xlsxwriter,openpyxl
mode,path=sys.argv[1:3]
if mode=='produce':
 book=xlsxwriter.Workbook(path);book.set_properties({'created':datetime.datetime(2026,10,22)})
 sheet=book.add_worksheet('Data');fmt=book.add_format({'bold':True,'num_format':'0.00'})
 for i,row in enumerate([[2,3],[4,5],[2,6]],1):sheet.write_row(i,0,row)
 sheet.write_dynamic_array_formula('C2:D4','=A2:B4*2',fmt,4)
 sheet.write_dynamic_array_formula('F2','=UNIQUE(A2:A4)',None,2)
 sheet.write_formula('I2','=SUM(_xlfn.ANCHORARRAY(C2))',None,44)
 other=book.add_worksheet('Other');other.write_formula('A1','=SUM(_xlfn.ANCHORARRAY(Data!C2))',None,44)
 book.close();print(json.dumps({'producer':'XlsxWriter '+xlsxwriter.__version__,'file':path}))
elif mode=='verify':
 expected=json.loads(Path(sys.argv[3]).read_text());book=openpyxl.load_workbook(path,data_only=False)
 for name,description in expected.items():
  sheet=book[name];assert sheet.array_formulae==description['arrays'],(name,sheet.array_formulae)
  for address,expression in description.get('formulas',{}).items():
   value=sheet[address].value;actual=value.text if hasattr(value,'text') else value
   assert actual==expression,(address,actual,expression)
  for address,value in description.get('values',{}).items():assert sheet[address].value==value,(address,sheet[address].value)
 print(json.dumps({'reader':'openpyxl '+openpyxl.__version__,'file':path,'independentReadPassed':True,'calculatedOrExcelValidated':False}))
else:raise ValueError('Expected produce or verify')
