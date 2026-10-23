'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
// Give source-bundled renderer harnesses a real same-origin URL for production workers.
async function startMergeBrowserServer(){
 const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><main id="host"></main><main id="other"></main>');return;}if(!/^\/[a-z0-9-]+\.js$/i.test(pathname)){res.writeHead(404).end();return;}const data=await fs.readFile(path.join(__dirname,'..','dist',pathname.slice(1)));res.setHeader('Content-Type','text/javascript');res.end(data);}catch{res.writeHead(404).end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});return {url:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={startMergeBrowserServer};
