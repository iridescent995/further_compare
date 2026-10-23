"""Clearly labelled pypdf mutations of genuine LO tagged output."""
import pathlib,re,json
from pypdf import PdfReader,PdfWriter
from pypdf.generic import DecodedStreamObject,NameObject
root=pathlib.Path(__file__).parent
r=PdfReader(root/'baseline.pdf');raw=r.pages[0].get_contents().get_data();pattern=rb'/[^\s/]+\s*<<\s*/MCID\s+(\d+)\s*>>\s*BDC\s*.*?\bEMC\b';matches=list(re.finditer(pattern,raw,re.S));assert [int(m[1])for m in matches]==list(range(6));blocks={int(m[1]):m[0]for m in matches};prefix=raw[:matches[0].start()];suffix=raw[matches[-1].end():]
def save(name,stream):
 w=PdfWriter();w.clone_document_from_reader(r);s=DecodedStreamObject();s.set_data(stream);w.pages[0][NameObject('/Contents')]=w._add_object(s)
 with (root/(name+'.pdf')).open('wb')as f:w.write(f)
save('drawing-row-major',prefix+b'\n'.join(blocks[i]for i in [0,1,3,2,4,5])+suffix)
save('duplicate-mcid',raw.replace(b'/MCID 3',b'/MCID 1'))
save('unmarked-text',raw.replace(blocks[3],re.sub(rb'^.*?BDC\s*',b'',blocks[3],count=1,flags=re.S).removesuffix(b'EMC')))
save('artifact-text',raw.replace(blocks[3],re.sub(rb'^.*?BDC',b'/Artifact BMC',blocks[3],count=1,flags=re.S)))
# Separate independent structure inventory, not PDF.js output.
def walk(o):
 o=o.get_object()if hasattr(o,'get_object')else o
 if isinstance(o,list):return [walk(x)for x in o]
 if isinstance(o,dict):return {'role':str(o.get('/S',o.get('/Type',''))),'children':walk(o.get('/K',[]))}
 return int(o)if isinstance(o,int)else str(o)
(root/'structure.json').write_text(json.dumps(walk(r.trailer['/Root']['/StructTreeRoot']),indent=2)+'\n')
print('content MCIDs:',[int(m[1])for m in matches]);print('derived drawing order:',[0,1,3,2,4,5]);print('baseline text:',r.pages[0].extract_text())
# Valid artifact-only final line: remove the matching semantic leaf and ParentTree
# mapping, unlike artifact-text.pdf's deliberately dangling structural reference.
from pypdf.generic import ArrayObject,NullObject
w=PdfWriter();w.clone_document_from_reader(r)
def remove_leaf(node):
 obj=node.get_object()if hasattr(node,'get_object')else node
 if not isinstance(obj,dict):return
 children=obj.get('/K')
 if isinstance(children,ArrayObject):
  kept=[]
  for child in children:
   child_obj=child.get_object()if hasattr(child,'get_object')else child
   if isinstance(child_obj,dict)and child_obj.get('/K') in (5,[5]):continue
   remove_leaf(child);kept.append(child)
  obj[NameObject('/K')]=ArrayObject(kept)
 elif isinstance(children,dict)or hasattr(children,'get_object'):remove_leaf(children)
remove_leaf(w._root_object['/StructTreeRoot'])
parent=w._root_object['/StructTreeRoot']['/ParentTree'];nums=parent['/Nums']
for i in range(1,len(nums),2):
 vals=nums[i].get_object()
 if isinstance(vals,ArrayObject)and len(vals)>5:vals[5]=NullObject()
s=DecodedStreamObject();s.set_data(raw.replace(blocks[5],re.sub(rb'^.*?BDC',b'/Artifact BMC',blocks[5],count=1,flags=re.S)));w.pages[0][NameObject('/Contents')]=w._add_object(s)
with(root/'artifact-footer-valid.pdf').open('wb')as f:w.write(f)
table=PdfReader(root/'table-list.pdf');(root/'table-list-structure.json').write_text(json.dumps(walk(table.trailer['/Root']['/StructTreeRoot']),indent=2)+'\n')
print('table/list text:',table.pages[0].extract_text())
expected=json.loads((root/'expected.json').read_text());expected['validArtifactLogicalParagraphs']=expected['logicalParagraphs'][:-1];expected['tableList']={'heading':'Structured table and list','rows':[['Item','Count'],['Café','2']],'listItems':['First item','Second Ω item'],'listLabels':['•','•'],'final':'After list.'};(root/'expected.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n')
# Ensure the artifact-only glyphs no longer have a semantic tree mapping.
valid=PdfReader(root/'artifact-footer-valid.pdf');inventory=walk(valid.trailer['/Root']['/StructTreeRoot'])
def leaves(node):
 if isinstance(node,int):return [node]
 if isinstance(node,list):return [i for n in node for i in leaves(n)]
 if isinstance(node,dict):return leaves(node.get('children',[]))
 return []
assert leaves(inventory)==[0,1,2,3,4]
(root/'artifact-footer-valid-structure.json').write_text(json.dumps(inventory,indent=2)+'\n')
