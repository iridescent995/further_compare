import handler from './doc-worker-handler.cjs';
let used=false;
self.onmessage=({data})=>{if(used)return;used=true;self.postMessage(handler.handleDocTask(data));self.close();};
