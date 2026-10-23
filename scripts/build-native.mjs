import {mkdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const source='desktop/native/rename-directory.c',output='build/native/rename-directory';
if(process.platform==='darwin'){
 await mkdir('build/native',{recursive:true});
 const fresh=await stat(output).then(async file=>file.mtimeMs>=(await stat(source)).mtimeMs).catch(()=>false);
 if(!fresh)execFileSync('/usr/bin/clang',['-O2','-Wall','-Wextra','-Werror','-arch','arm64','-arch','x86_64','-mmacosx-version-min=11.0',source,'-o',output],{stdio:'inherit'});
 console.log('Universal macOS directory rename helper ready.');
}else if(process.platform==='win32'){
 await stat('desktop/native/rename-directory.ps1');console.log('Windows directory rename helper ready.');
}
