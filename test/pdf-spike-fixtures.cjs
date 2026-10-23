'use strict';
function fixture(empty=false){
 const cmap='/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Unicode def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange 3 beginbfchar <41> <03A9> <42> <4E2D> <43> <D83DDE80> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end';
 const stream=s=>`<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
 const content=empty?'': 'BT /F1 16 Tf 72 700 Td <414243> Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',...Array(2).fill('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>'),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding /ToUnicode 7 0 R >>',stream(content),stream(cmap)];
 let output='%PDF-1.7\n',offsets=[0];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return [...Buffer.from(output)];
}
function graphicFixture(columns){
 const stream=columns?'BT /F1 12 Tf 60 700 Td (Left top) Tj 0 -20 Td (Left bottom) Tj 250 20 Td (Right top) Tj 0 -20 Td (Right bottom) Tj ET':'q 100 0 0 100 40 600 cm /Im0 Do Q';
 const raw=columns?'':'\xff\x00\x00';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im0 6 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${raw.length} >>\nstream\n${raw}\nendstream`];let text='%PDF-1.7\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(text,'latin1'));text+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const start=Buffer.byteLength(text,'latin1');text+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return [...Buffer.from(text,'latin1')];
}
module.exports={fixture,graphicFixture};
