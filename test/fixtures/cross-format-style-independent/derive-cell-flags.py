"""Labelled synthetic control: current cell XF fields unchanged, apply flags false."""
from pathlib import Path
import zipfile,xml.etree.ElementTree as E
p=Path(__file__).resolve().parent
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(p/'baseline.xlsx') as z:
 root=E.fromstring(z.read('xl/styles.xml'))
 for xf in root.find('s:cellXfs',ns):
  for key in ['applyFont','applyFill','applyBorder','applyNumberFormat','applyAlignment','applyProtection']:xf.set(key,'false')
 E.register_namespace('',ns['s']);updated=E.tostring(root,encoding='utf-8',xml_declaration=True)
 with zipfile.ZipFile(p/'derived-cell-flags-false.xlsx','w',zipfile.ZIP_DEFLATED) as out:
  for info in z.infolist():out.writestr(info,updated if info.filename=='xl/styles.xml' else z.read(info.filename))
