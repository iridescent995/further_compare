"""Controlled independent fixtures. Run with openpyxl 3.1.5; no user input files."""
from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, platform, xml.etree.ElementTree as ET
import openpyxl
from openpyxl import Workbook, load_workbook
from openpyxl.formatting.rule import Rule, FormulaRule, CellIsRule, ColorScaleRule, DataBarRule, IconSetRule
from openpyxl.styles import PatternFill, Font, Color
from openpyxl.styles.differential import DifferentialStyle
ROOT=Path(__file__).parent
NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
ET.register_namespace('',NS)
def build(name, changed=False):
 w=Workbook();s=w.active;s.title='Rules'
 s.append(['expression','cellIs','top10','average','scale','bar','icons','empty full column'])
 for n in [10,20,30]:s.append([n]*7)
 red=PatternFill(fill_type='solid',fgColor='FFFFCCCC');blue=PatternFill(fill_type='solid',fgColor='FFCCE5FF')
 s.conditional_formatting.add('A2:A1048576',FormulaRule(formula=['A2>15' if changed else 'A2>10'],fill=red,stopIfTrue=True))
 s.conditional_formatting.add('B2:B20',CellIsRule(operator='greaterThan',formula=['15'],fill=blue))
 s.conditional_formatting.add('C2:C20',Rule(type='top10',rank=2,percent=False,bottom=False,dxf=DifferentialStyle(font=Font(bold=True,color=Color(theme=4,tint=0.2)))))
 s.conditional_formatting.add('D2:D20',Rule(type='aboveAverage',aboveAverage=True,equalAverage=False,stdDev=1,dxf=DifferentialStyle(fill=red)))
 s.conditional_formatting.add('E2:E20',ColorScaleRule(start_type='min',start_color='FFF8696B',mid_type='percentile',mid_value=60 if changed else 50,mid_color='FFFFEB84',end_type='max',end_color='FF63BE7B'))
 s.conditional_formatting.add('F2:F20',DataBarRule(start_type='num',start_value=0,end_type='num',end_value=40,color='FF638EC6',showValue=True))
 s.conditional_formatting.add('G2:G20',IconSetRule(icon_style='3TrafficLights1',type='percent',values=[0,33,67],showValue=True,percent=True,reverse=False))
 s.conditional_formatting.add('H1:H1048576',FormulaRule(formula=['ISBLANK(H1)'],fill=blue))
 if changed:
  first=next(iter(s.conditional_formatting._cf_rules.values()))[0];first.priority=20
  first.dxf.fill.fgColor='FFFFBBDD'
 w.save(ROOT/name)
 # Independent producer readback verifies caches/expressions are actually serialized.
 check=load_workbook(ROOT/name);assert len(check.active.conditional_formatting)==8
build('baseline.xlsx');build('changed.xlsx',True)
def mutate(name, fn):
 with ZipFile(ROOT/'baseline.xlsx') as z:parts={n:z.read(n) for n in z.namelist()}
 fn(parts)
 with ZipFile(ROOT/name,'w',ZIP_DEFLATED) as z:
  for n,b in parts.items():z.writestr(n,b)
def renumber(parts):
 styles=ET.fromstring(parts['xl/styles.xml']);dxfs=styles.find('{'+NS+'}dxfs');children=list(dxfs);dxfs[:]=children[::-1]
 sheet=ET.fromstring(parts['xl/worksheets/sheet1.xml'])
 for rule in sheet.iter('{'+NS+'}cfRule'):
  if 'dxfId' in rule.attrib:rule.set('dxfId',str(len(children)-1-int(rule.get('dxfId'))))
 parts['xl/styles.xml']=ET.tostring(styles);parts['xl/worksheets/sheet1.xml']=ET.tostring(sheet)
mutate('renumbered.xlsx',renumber)
def themed(parts):parts['xl/theme/theme1.xml']=parts['xl/theme/theme1.xml'].replace(b'4F81BD',b'8F41AD')
mutate('theme-changed.xlsx',themed)
def extension(parts):
 s=ET.fromstring(parts['xl/worksheets/sheet1.xml']);exts=ET.SubElement(s,'{'+NS+'}extLst');ext=ET.SubElement(exts,'{'+NS+'}ext',uri='{78C0D931-6437-407D-A8EE-F0AAD7539E65}');group=ET.SubElement(ext,'{http://schemas.microsoft.com/office/spreadsheetml/2009/9/main}conditionalFormattings');cf=ET.SubElement(group,'{http://schemas.microsoft.com/office/spreadsheetml/2009/9/main}conditionalFormatting');rule=ET.SubElement(cf,'{http://schemas.microsoft.com/office/spreadsheetml/2009/9/main}cfRule',type='expression',priority='9',id='{01234567-89AB-CDEF-0123-456789ABCDEF}');ET.SubElement(rule,'{http://schemas.microsoft.com/office/excel/2006/main}f').text='A2>10';ET.SubElement(cf,'{http://schemas.microsoft.com/office/excel/2006/main}sqref').text='A2:A20';parts['xl/worksheets/sheet1.xml']=ET.tostring(s)
mutate('unsupported.xlsx',extension)
def badref(parts):parts['xl/worksheets/sheet1.xml']=parts['xl/worksheets/sheet1.xml'].replace(b'sqref="B2:B20"',b'sqref="B0:B20"')
mutate('malformed-reference.xlsx',badref)
def moved(parts):
 mappings={'xl/worksheets/sheet1.xml':'xl/custom/rules.xml','xl/styles.xml':'xl/custom/presentation.xml'}
 for old,new in mappings.items():
  parts[new]=parts.pop(old)
  for manifest in ['xl/_rels/workbook.xml.rels','[Content_Types].xml']:
   parts[manifest]=parts[manifest].replace(('/'+old).encode(),('/'+new).encode()).replace(('"'+old.removeprefix('xl/')+'"').encode(),('"'+new.removeprefix('xl/')+'"').encode())
 ET.register_namespace('sheet',NS)
 for name in ['xl/custom/rules.xml','xl/custom/presentation.xml','xl/workbook.xml']:parts[name]=ET.tostring(ET.fromstring(parts[name]))
 ET.register_namespace('',NS)
mutate('paths-prefixes.xlsx',moved)
for name in ['renumbered.xlsx','theme-changed.xlsx']:
 assert len(load_workbook(ROOT/name).active.conditional_formatting)==8
(ROOT/'provenance.json').write_text(json.dumps({'producer':'openpyxl','version':openpyxl.__version__,'python':platform.python_version(),'generation':'generate.py; baseline/changed producer output; other cases documented XML mutations of baseline','sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.glob('*.xlsx'))}},indent=2)+'\n')
