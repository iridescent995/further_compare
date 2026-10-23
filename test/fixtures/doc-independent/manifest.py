"""Mechanically transcribe independent UNO output; never import app extraction."""
import pathlib,json,hashlib
root=pathlib.Path(__file__).resolve().parent
result={}; current=None; page=None
for line in (root/'libreoffice-readback.txt').read_text().splitlines():
    kind,*fields=line.split('\t')
    if kind=='DOCUMENT':
        current={'body':'','footnotes':[],'endnotes':[],'pages':[],'paragraphStyles':[],'cells':[],'textboxes':[],'fields':[],'annotations':[]};result[fields[0]]=current
    elif kind=='BODY': current['body']='\t'.join(fields).replace('\\n','\n')
    elif kind in ('FOOTNOTE','ENDNOTE'): current['footnotes' if kind=='FOOTNOTE' else 'endnotes'].append({'ordinal':int(fields[0]),'text':'\t'.join(fields[1:]).replace('\\n','\n')})
    elif kind=='PAGE': page={'name':fields[0],'inUse':fields[1]=='inUse=true'};current['pages'].append(page)
    elif kind in ('HeaderText','FooterText'): page[kind]='\t'.join(fields).replace('\\n','\n')
    elif kind=='PARAGRAPH':current['paragraphStyles'].append(fields)
    elif kind=='CELL':current['cells'].append({'table':fields[0],'address':fields[1],'text':'\t'.join(fields[2:]).replace('\\n','\n')})
    elif kind=='TEXTBOX':current['textboxes'].append({'name':fields[0],'text':'\t'.join(fields[1:]).replace('\\n','\n')})
    elif kind=='ANNOTATION':current['annotations'].append({'author':fields[0],'text':'\t'.join(fields[1:])})
    elif kind=='FIELD':current['fields'].append({'description':fields[0],'result':'\t'.join(fields[1:])})
assert result['baseline.doc']['body']==result['related-changed.doc']['body']
assert result['baseline.doc']['body']!=result['body-changed.doc']['body']
(root/'expected.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(root/'sha256.json').write_text(json.dumps({p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.iterdir()) if p.suffix in ('.doc','.fodt')},indent=2)+'\n')
