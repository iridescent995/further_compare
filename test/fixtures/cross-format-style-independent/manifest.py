"""Transcribe independent UNO observations, never application parser output."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parent
keys=['row','column','value','fontName','fontSize','fontWeight','fontColor','backgroundColor','bottomBorder','horizontalAlignment','wrap','rotation','protection','numberFormat']
out={}; current=None; sheet=None
for line in (root/'libreoffice-readback.txt').read_text().splitlines():
 kind,*v=line.split('\t')
 if kind=='FILE':current=v[0];out[current]={}
 elif kind=='SHEET':sheet=v[1];out[current][sheet]=[]
 elif kind=='CELL':assert len(v)==len(keys);out[current][sheet].append(dict(zip(keys,v)))
(root/'independent-readback.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
(root/'sha256.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.iterdir()) if p.suffix in ['.xls','.xlsx']},indent=2)+'\n')
comparisons={}
for a,b in [('baseline.xls','baseline-from-xls.xlsx'),('baseline.xlsx','derived-cell-flags-false.xlsx'),('baseline.ods','baseline.xlsx'),('baseline.xls','baseline.xlsx'),('pandas-test1.xlsb','pandas-from-xlsb.xlsx')]:
 changes=[]
 for name,cells in out[a].items():
  target={(x['row'],x['column']):x for x in out[b][name]}
  for cell in cells:
   other=target[(cell['row'],cell['column'])]
   delta={k:[cell[k],other[k]] for k in keys[2:] if cell[k]!=other[k]}
   if delta:changes.append({'sheet':name,'row':cell['row'],'column':cell['column'],'changes':delta})
 comparisons[a+' -> '+b]=changes
(root/'observed-conversion-changes.json').write_text(json.dumps(comparisons,ensure_ascii=False,indent=2)+'\n')
print({k:len(v) for k,v in comparisons.items()})
