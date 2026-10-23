// Run before workspace markup is parsed; appearance must not wait for the app bundle.
(()=>{
 let saved={};try{saved=JSON.parse(localStorage.getItem('further-compare.display.v1'))||{};}catch{}
 const theme=['system','light','dark'].includes(saved.theme)?saved.theme:'light';
 const body=document.body;
 body.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
 body.dataset.density=['compact','comfortable'].includes(saved.density)?saved.density:'compact';
 const fontSize=[12,13,14,15].includes(saved.fontSize)?saved.fontSize:13;
 body.dataset.fontSize=String(fontSize);body.style.setProperty('--ui-font-size',fontSize+'px');
})();
