'use strict';
const kinds={
 binary:{label:'file'},text:{label:'text file'},
 image:{label:'image',filter:'Images',extensions:['png','jpg','jpeg','webp','gif']},
 table:{label:'table',filter:'Tables and workbooks',extensions:['csv','tsv','xlsx','ods','xls','xlsb']},
 audio:{label:'audio file',filter:'WAV, AIFF, FLAC and MP3 audio',extensions:['wav','aif','aiff','flac','mp3']},
 archive:{label:'archive',filter:'ZIP, JAR and TAR archives',extensions:['zip','jar','tar','tgz','gz']},
 registry:{label:'registry file',filter:'Exported registry files',extensions:['reg']}
};
function dataOpenDialog(side,kind){
 if(!['a','b','base'].includes(side)||typeof kind!=='string'||!Object.hasOwn(kinds,kind))throw Error('Invalid data input.');
 const spec=kinds[kind],filters=spec.extensions?[{name:spec.filter,extensions:[...spec.extensions]}]:[];
 filters.push({name:'All files',extensions:['*']});
 return {properties:['openFile'],title:`Open ${side==='base'?'base':side==='a'?'left':'right'} ${spec.label}`,filters};
}
module.exports={dataOpenDialog};
