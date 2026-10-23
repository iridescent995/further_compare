import {inspectTextPatch,applyTextPatch} from './text-patch-apply.cjs';
self.onmessage=({data})=>{try{self.postMessage(data.action==='inspect'?{entries:inspectTextPatch(data.patch)}:{result:applyTextPatch(data)});}catch(error){self.postMessage({error:error.message});}};
