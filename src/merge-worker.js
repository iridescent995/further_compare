import engine from './structured-diff.cjs';
self.onmessage=({data})=>{
 try{
  if(!Array.isArray(data.inputs)||data.inputs.length!==3||data.inputs.some(value=>typeof value!=='string'))throw Error('Invalid merge inputs.');
  const texts=data.inputs.map(value=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value),character=>character.charCodeAt(0))));
  self.postMessage({id:data.id,result:engine.mergeText3(...texts)});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
