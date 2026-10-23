'use strict';
// Projection oracle from independent UNO readback, with explicitly specified
// generated-citation omission and stored table row separators. No app imports.
const fs=require('node:fs/promises'),path=require('node:path');
const oracle=require('./fixtures/doc-independent/expected.json');
function expected(name='baseline.doc'){
 return oracle[name].body.replace('alpha1 middlei omega.','alpha middle omega.')
 .replace('alpha middle1i omega.','alpha middle omega.')
 .replace('Cell A1 Café\nCell B1 Ω\nCell A2 中\n\n','Cell A1 Café\tCell B1 Ω\nCell A2 中\t\n')+'\n';
}
module.exports={expected,authentic:(name='baseline.doc')=>fs.readFile(path.join(__dirname,'fixtures/doc-independent',name))};
