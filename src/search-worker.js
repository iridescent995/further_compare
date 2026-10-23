import {regexSearch} from './regex-search.cjs';
self.onmessage=event=>{try{self.postMessage({result:regexSearch(event.data)});}catch(error){self.postMessage({error:error.message});}};
