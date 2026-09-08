export type CommandOutput=ReturnType<typeof createCommandOutput>;
export function createCommandOutput(format:'human'|'json',meta:object){
 const emit=(data:object)=>process.stdout.write(JSON.stringify({...meta,mode:'speculos',hardwareBacked:false,...data})+'\n');
 const note=(text:string)=>process.stderr.write(text+'\n');
 return {run:async<T>(fn:()=>Promise<T>)=>fn(),spin:(label:string)=>{note(label);return {success:note};},withActivity:async<T>(label:string,done:string,fn:()=>Promise<T>)=>{note(label);const result=await fn();note(done);return result;},ringInit:emit,ringEncrypt:emit,ringDecrypt:emit};
}
