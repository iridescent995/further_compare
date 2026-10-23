'use strict';
const DEFAULT_ENDPOINT_KINDS=Object.freeze({a:'local',b:'local'});
function validateEndpointKinds(value=DEFAULT_ENDPOINT_KINDS){
 if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.keys(value).length!==2||Object.keys(value).some(key=>!['a','b'].includes(key))||!['local','remote'].includes(value.a)||!['local','remote'].includes(value.b))throw TypeError('Choose valid folder endpoint kinds.');
 return Object.freeze({a:value.a,b:value.b});
}
function validEndpointRelative(value,kind='local'){
 return ['local','remote'].includes(kind)&&typeof value==='string'&&value.length>0&&value.length<=32768&&!/[\\\0]/.test(value)&&!value.startsWith('/')&&(kind==='remote'||!/^[A-Za-z]:/.test(value))&&!value.split('/').some(part=>!part||part==='.'||part==='..');
}
function endpointRelative(value,kind='local'){
 if(!validEndpointRelative(value,kind))throw TypeError('Choose a valid root-relative POSIX path.');return value;
}
const swapEndpointKinds=value=>validateEndpointKinds({a:value.b,b:value.a});
module.exports={validateEndpointKinds,validEndpointRelative,endpointRelative,swapEndpointKinds};
