import {filenameMatches} from './filename-search.cjs';
self.onmessage=event=>{try{self.postMessage({result:filenameMatches(event.data.entries,event.data.options)});}catch(error){self.postMessage({error:error.message});}};
