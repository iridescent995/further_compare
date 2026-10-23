"""Independent openpyxl inputs; optionally convert with LibreOffice for BIFF8."""
from pathlib import Path
import hashlib, json, openpyxl
root=Path(__file__).parent
for variant in ['baseline','changed','many']:
    w=openpyxl.Workbook();s=w.active;s.title='Formats'
    for row,(value,fmt) in enumerate([(12.5,'0.00'),(0.25,'0%'),(1234,'#,##0'),('code','@'),(None,'0.0000')],1):
        s.cell(row,1,value).number_format=fmt
    if variant=='changed':
        s['A1'].number_format='0.000';s['A5'].number_format='0.00000'
    if variant=='many':
        for row in range(1,122):s.cell(row,2).number_format='0.0000'
    w.create_sheet('General')['A1']=12.5
    w.save(root/(variant+'.xlsx'))
manifest={'producer':'openpyxl '+openpyxl.__version__,'purpose':'Same stored values; different explicit number formats, styled blanks and sheet switching. No SheetJS writer used.','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.glob('*.xlsx')}}
(root/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')
