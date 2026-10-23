import {readdir,stat,copyFile,writeFile,mkdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
await mkdir('public/downloads',{recursive:true});
const manifest={};
for(const file of await readdir('release').catch(()=>[])){
 const match=/^Further-Compare-(mac|windows)-(arm64|x64)\.zip$/.exec(file);if(!match)continue;
 const hash=createHash('sha256');for await(const chunk of createReadStream('release/'+file))hash.update(chunk);
 await copyFile('release/'+file,'public/downloads/'+file);
 manifest[match[1]+'-'+match[2]]={url:'downloads/'+file,size:(await stat('release/'+file)).size,sha256:hash.digest('hex')};
}
await writeFile('public/downloads/manifest.json',JSON.stringify(manifest,null,2)+'\n');
console.log(`Prepared ${Object.keys(manifest).length} verified package links. Run npm run build to include them in the website.`);
