'use strict';
const {splitFolderPatterns,appendExcludedPaths}=require('./folder-view.cjs');

/** Derive filename globs using the selected pane's actual names, never logical IDs. */
function selectedFileTypeMasks(rows,side){
 if(side!=='a'&&side!=='b')throw Error('Choose the left or right file pane.');
 if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error('Select between 1 and 1,000 files to exclude their types.');
 const suffix=side==='a'?'A':'B',masks=new Set();
 for(const row of rows){
  if(!row||row['kind'+suffix]!=='file'||row.kindA==='directory'||row.kindB==='directory'||row.alignmentConflict||row.status==='conflict')throw Error('Select regular files only, without folders or type conflicts.');
  const explicit=row['name'+suffix],relative=row['path'+suffix];
  const name=typeof explicit==='string'&&explicit?explicit:typeof relative==='string'?relative.split('/').pop():'';
  if(!name||name.includes('/')||name.includes('\\'))throw Error('A selected file has no valid filename. Refresh the folder and try again.');
  const dot=name.lastIndexOf('.');
  if(name.startsWith('.')||dot<=0||dot===name.length-1)throw Error('Files without an extension and dotfiles cannot be excluded by type. Use Exclude selected instead.');
  const extension=name.slice(dot+1).toLowerCase();
  // Glob syntax has no literal escape for * or ?; quotes denote exact paths,
  // and semicolons delimit patterns. Refuse an ambiguous mask atomically.
  if(/[\*?;"\\/\u0000-\u001f\u007f]/u.test(extension)||extension.trim()!==extension)throw Error('A selected extension cannot be represented safely as a filename filter. Use Exclude selected instead.');
  masks.add('*.'+extension);
 }
 return [...masks];
}
function appendTypeMasks(expression,masks){
 if(!Array.isArray(masks)||!masks.length||masks.length>1000||masks.some(mask=>typeof mask!=='string'||!mask.startsWith('*.')||mask.length<=2||/[.*?;"\\/\u0000-\u001f\u007f]/u.test(mask.slice(2))||mask.slice(2).trim()!==mask.slice(2)))throw Error('Invalid file type masks. Select regular files with safe extensions.');
 // Validate existing quoted paths with the same parser used by path exclusions.
 const patterns=splitFolderPatterns(appendExcludedPaths(expression,[]));
 const known=new Set(patterns.filter(pattern=>!pattern.startsWith('"')).map(pattern=>pattern.toLowerCase()));
 for(const value of masks){const mask=value.toLowerCase();if(!known.has(mask)){patterns.push(mask);known.add(mask);}}
 const result=patterns.join(';');
 if(result.length>4096)throw Error('Too many exclusions. Edit filename filters to shorten the list.');
 return result;
}
function appendExcludedFileTypes(expression,rows,side){return appendTypeMasks(expression,selectedFileTypeMasks(rows,side));}
module.exports={fileTypeMasks:selectedFileTypeMasks,appendTypeMasks,selectedFileTypeMasks,appendExcludedFileTypes};
