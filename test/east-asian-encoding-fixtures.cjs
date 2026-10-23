'use strict';
// Fixed common-character bytes independently checked against Python standard codecs.
module.exports=[
 {encoding:'shift-jis',text:'日本語',hex:'93fa967b8cea'},
 {encoding:'euc-jp',text:'日本語',hex:'c6fccbdcb8ec'},
 {encoding:'gb18030',text:'中文',hex:'d6d0cec4'},
 {encoding:'big5',text:'中文',hex:'a4a4a4e5'},
 {encoding:'euc-kr',text:'한국어',hex:'c7d1b1b9beee'},
].map(item=>({...item,bytes:Buffer.concat([Buffer.from(item.hex,'hex'),Buffer.from('\r\n')])}));

module.exports.alias={encoding:'big5',text:'十',bytes:Buffer.from('a2cc0d0a','hex'),canonical:Buffer.from('a451','hex')};
