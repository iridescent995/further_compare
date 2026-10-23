#!/usr/bin/env node
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import integration from '../desktop/shell-integration.cjs';
export const {generate,workflow}=integration;
async function main(){const args=process.argv.slice(2);let app,output,install=false,uninstall=false;while(args.length){const arg=args.shift();if(arg==='--app')app=args.shift();else if(arg==='--output')output=args.shift();else if(arg==='--install')install=true;else if(arg==='--uninstall')uninstall=true;else throw Error(`Unknown argument: ${arg}`);}const services=path.join(os.homedir(),'Library/Services');if(!install&&output&&path.resolve(output)===services)throw Error('Writing user Services requires --install.');if(install&&output)throw Error('Use either --install or --output.');output=install?services:output||path.resolve('release/finder-services');await generate({app,output,uninstall});console.log(`${uninstall?'Removed':'Created'} Further Compare workflows in ${output}`);}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
