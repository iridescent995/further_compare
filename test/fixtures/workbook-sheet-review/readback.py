"""After documented LO conversions, independently inventory resulting XLSX files."""
import json,pathlib,openpyxl,hashlib
P=pathlib.Path(__file__).parent
report={}
paths=[(f'{base}.{kind}',pathlib.Path('/private/tmp/fc-sheet-review-readback')/kind/(base+'.xlsx')) for kind in ('ods','xls') for base in ('baseline','changed')]
paths.append(('pandas-test1.xlsb',P.parent.parent/'xlsb-fixtures/pandas-test1-libreoffice.xlsx'))
for label,file in paths:
 w=openpyxl.load_workbook(file,data_only=False);values=openpyxl.load_workbook(file,data_only=True)
 report[label]=[{'name':s.title,'ordinal':i,'visibility':s.sheet_state,'representativeCells':{address:{'value':s[address].value,'type':s[address].data_type,'cachedValue':values[s.title][address].value} for address in ['A1','A2','B2','B3','B4']}} for i,s in enumerate(w)]
(P/'libreoffice-readback.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str)+'\n')
(P/'sha256.json').write_text(json.dumps({f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in P.iterdir() if f.suffix in ('.xlsx','.xls','.ods')},indent=2)+'\n')
for key,sheets in report.items(): print(key,[(s['name'],s['visibility']) for s in sheets])
