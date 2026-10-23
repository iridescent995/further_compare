'use strict';
// Pure metadata definitions shared by the renderer, menus and session validator.
const FOLDER_FILTERS=Object.freeze([
 ['left','left only'],['right','right only'],['paired','paired entries'],['paired-diff','changed pairs'],['one-sided','one-sided entries'],
 ['newer-left','newer on left'],['newer-right','newer on right'],['newer-left-or-only','newer or only on left'],['newer-right-or-only','newer or only on right']
].map(Object.freeze));
const FOLDER_FILTER_IDS=Object.freeze(FOLDER_FILTERS.map(([id])=>id));
function matchesFolderStatus(row,status){
 const paired=Boolean(row.kindA&&row.kindB),changed=['changed','different','conflict'].includes(row.status),left=row.status==='left',right=row.status==='right';
 const dated=row.kindA==='file'&&row.kindB==='file'&&Number.isFinite(row.mtimeA)&&Number.isFinite(row.mtimeB);
 const newerLeft=dated&&row.mtimeA>row.mtimeB,newerRight=dated&&row.mtimeB>row.mtimeA;
 switch(status){
 case 'all':return true;
 case 'diff':case 'context':return changed||left||right;
 case 'same':return row.status==='equal';
 case 'left':return left;
 case 'right':return right;
 case 'paired':return paired;
 case 'paired-diff':return paired&&changed;
 case 'one-sided':return left||right;
 case 'newer-left':return newerLeft;
 case 'newer-right':return newerRight;
 case 'newer-left-or-only':return newerLeft||left;
 case 'newer-right-or-only':return newerRight||right;
 default:return false;
 }
}
module.exports={FOLDER_FILTERS,FOLDER_FILTER_IDS,matchesFolderStatus};
