import {createTextPatch} from './text-patch.cjs';
self.onmessage=({data})=>{try{self.postMessage({patch:createTextPatch(data)});}catch(error){self.postMessage({error:error.message});}};
