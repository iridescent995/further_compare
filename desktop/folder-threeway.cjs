'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {FolderService}=require('./folders.cjs');
const {classifyThreeWay,resolveThreeWay}=require('./folder-threeway-core.cjs');
const {buildThreeWayPlan}=require('./folder-threeway-plan.cjs');
const {executeThreeWayPlan}=require('./folder-threeway-execute.cjs');
const SIDES=['base','left','right'];
const identity=stat=>`${stat.dev}:${stat.ino}`;
const snapshotSignature=snapshots=>JSON.stringify(SIDES.map(side=>({side,identity:snapshots[side].identity,skipped:snapshots[side].skipped,entries:[...snapshots[side].entries].sort(([a],[b])=>a<b?-1:a>b?1:0)})));
const outputSignature=snapshot=>JSON.stringify({identity:snapshot.identity,skipped:snapshot.skipped,entries:[...snapshot.entries].sort(([a],[b])=>a<b?-1:a>b?1:0)});
const inside=(root,value)=>{const relative=path.relative(root,value);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
const overlap=(a,b)=>inside(a,b)||inside(b,a);

// Native-only authority for three-way inputs and output. Only private, current
// preview IDs can reach execution; renderer-provided operations are never trusted.
class ThreeWayFolders {
 #backupRoot; #inputs=new Map(); #revision=randomUUID(); #analysis=null; #busy=false; #output=null; #plan=null;
 constructor(backupRoot){this.#backupRoot=backupRoot;}
 get revision(){return this.#revision;}
 get roots(){return Object.fromEntries([...this.#inputs].map(([side,input])=>[side,{...input.descriptor}]));}
 get output(){return this.#output?{...this.#output.descriptor}:null;}
 async #exclusive(operation){if(this.#busy)throw Error('A three-way folder operation is already running.');this.#busy=true;try{return await operation();}finally{this.#busy=false;}}
 async select(side,root){
  if(!SIDES.includes(side))throw Error('Choose base, left or right.');
  return this.#exclusive(async()=>{
   const service=new FolderService(this.#backupRoot),descriptor=await service.select('a',root);
   const stat=await fs.lstat(descriptor.path,{bigint:true});
   if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular directory.');
   if(this.#output&&overlap(descriptor.path,this.#output.descriptor.path))throw Error('Input and output folders must be separate and cannot contain one another.');
   this.#inputs.set(side,{service,descriptor,identity:identity(stat)});
   this.#analysis=null;this.#plan=null;this.#revision=randomUUID();return {...descriptor};
  });
 }
 async selectOutput(root){return this.#exclusive(async()=>{
  const service=new FolderService(this.#backupRoot),descriptor=await service.select('a',root),stat=await fs.lstat(descriptor.path,{bigint:true});
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Choose a regular output directory.');
  if([...this.#inputs.values()].some(input=>overlap(input.descriptor.path,descriptor.path)))throw Error('Input and output folders must be separate and cannot contain one another.');
  this.#output={service,descriptor,identity:identity(stat)};this.#plan=null;return {...descriptor};
 });}
 async #checkOutput(){
  if(!this.#output)throw Error('Choose an output folder.');
  const current=await this.#output.service.directoryPath('a'),stat=await fs.lstat(current,{bigint:true});
  if(current!==this.#output.descriptor.path||identity(stat)!==this.#output.identity)throw Error('The output root changed. Select it again.');
  if([...this.#inputs.values()].some(input=>overlap(input.descriptor.path,current)))throw Error('Input and output folders must be separate.');
 }
 async #readOutput(){await this.#checkOutput();const snapshot=await this.#output.service.snapshot('a');await this.#checkOutput();return snapshot;}
 async #checkRoots(){
  for(const side of SIDES){
   const input=this.#inputs.get(side);if(!input)throw Error('Choose the base, left and right folders.');
   const current=await input.service.directoryPath('a'),stat=await fs.lstat(current,{bigint:true});
   if(current!==input.descriptor.path||identity(stat)!==input.identity)throw Error('A three-way input root changed. Select it again.');
  }
 }
 async #read(){
  await this.#checkRoots();const snapshots={};
  for(const side of SIDES){snapshots[side]=await this.#inputs.get(side).service.snapshot('a');await this.#checkRoots();}
  return snapshots;
 }
 async analyze(){return this.#exclusive(async()=>{
  this.#analysis=null;this.#plan=null;this.#revision=randomUUID();
  const snapshots=await this.#read(),rows=classifyThreeWay(snapshots);
  this.#analysis={snapshots,signature:snapshotSignature(snapshots)};
  return {revision:this.#revision,rows:structuredClone(rows),roots:this.roots,skipped:Object.fromEntries(SIDES.map(side=>[side,snapshots[side].skipped]))};
 });}
 async #resolve(choices,revision){
  if(!this.#analysis||revision!==this.#revision)throw Error('Three-way analysis changed. Analyze the folders again.');
  const captured=this.#analysis,decisions=structuredClone(choices);let current;
  try{current=await this.#read();if(snapshotSignature(current)!==captured.signature)throw Error('Three-way inputs changed after analysis. Analyze again.');}
  catch(error){this.#analysis=null;this.#plan=null;this.#revision=randomUUID();throw error;}
  return {result:resolveThreeWay(current,decisions),snapshots:current};
 }
 async resolve(choices={},revision){return this.#exclusive(async()=>{
  this.#plan=null;
  const {result}=await this.#resolve(choices,revision);
  return {revision:this.#revision,entries:[...result.entries].map(([path,entry])=>({path,...structuredClone(entry)})),conflicts:[...result.conflicts]};
 });}
 async preview(choices={},revision){return this.#exclusive(async()=>{
  this.#plan=null;
  const {result,snapshots}=await this.#resolve(choices,revision),target=await this.#readOutput();
  const operations=buildThreeWayPlan(result,target),id=randomUUID(),counts={};
  for(const operation of operations)counts[operation.type]=(counts[operation.type]||0)+1;
  this.#plan={id,revision,operations,inputs:snapshotSignature(snapshots),target:outputSignature(target)};
  return {id,revision,output:this.output,operations:structuredClone(operations),counts};
 });}
 async #validatePlan(plan){
  if(plan.revision!==this.#revision)throw Error('The output preview changed. Review the changes again.');
  const inputs=await this.#read(),target=await this.#readOutput();
  if(snapshotSignature(inputs)!==plan.inputs||outputSignature(target)!==plan.target)throw Error('Input or output files changed after preview. Review the changes again.');
  return {inputs,target};
 }
 async verifyPreview(id){return this.#exclusive(async()=>{
  if(!this.#plan||this.#plan.id!==id||this.#plan.revision!==this.#revision)throw Error('The output preview changed. Review the changes again.');
  const plan=this.#plan;
  try{
   await this.#validatePlan(plan);
  }catch(error){this.#plan=null;throw error;}
  return {id:plan.id,revision:plan.revision,output:this.output,operations:structuredClone(plan.operations)};
 });}
 async execute(id){return this.#exclusive(async()=>{
  if(!this.#plan||this.#plan.id!==id)throw Error('The output preview changed. Review the changes again.');
  const plan=this.#plan;this.#plan=null;
  const {inputs,target}=await this.#validatePlan(plan);
  return executeThreeWayPlan({id:plan.id,operations:plan.operations,
   inputs:Object.fromEntries([...this.#inputs].map(([side,input])=>[side,input.service])),
   output:this.#output.service,inputSnapshots:inputs,targetSnapshot:target,backupRoot:this.#output.service.backupRoot,
   checkRoots:async()=>{await this.#checkRoots();await this.#checkOutput();},
   validatePreview:()=>this.#validatePlan(plan)});
 });}
}
module.exports={ThreeWayFolders};
