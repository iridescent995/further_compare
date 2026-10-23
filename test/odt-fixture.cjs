'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const expected='Document heading\nCafé Ω中🚀\nTwo\nlines\nFirst item\nSecond item\nKey\tValue\nalpha\tLEFT\nTail';
async function authentic(side='left'){return fs.readFile(path.join(__dirname,'odt-fixtures',side==='right'?'fc-odt-right.odt':'fc-odt-producer.odt'));}
module.exports={authentic,expected,rightExpected:expected.replace('LEFT','RIGHT')};
