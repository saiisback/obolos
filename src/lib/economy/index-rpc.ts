/** The public Arc RPC can return JSON-RPC rate limits through nested contract errors.
 * Retry only read operations, preserving their exact pinned-block arguments. */
function rateLimited(error:unknown):boolean{
 let current=error;
 for(let depth=0;current&&typeof current==='object'&&depth<8;depth++){
  const e=current as {name?:unknown;code?:unknown;status?:unknown;cause?:unknown};
  if(e.name==='LimitExceededRpcError'||e.code===-32005||e.status===429)return true;
  current=e.cause;
 }
 return false;
}
export function serializeIndexReads<T extends object>(client:T,{pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))}:{pause?:(ms:number)=>Promise<void>}={}):T{
 let tail:Promise<unknown>=Promise.resolve();
 const methods=new Map<PropertyKey,unknown>();
 return new Proxy(client,{get(target,key,receiver){
  const value=Reflect.get(target,key,receiver);
  if(!['getChainId','getBlock','getLogs','readContract','getCode','simulateContract','call','getTransactionReceipt'].includes(String(key))||typeof value!=='function')return value;
  if(!methods.has(key))methods.set(key,(...args:unknown[])=>{
   const result=tail.then(async()=>{
    for(let attempt=0;;attempt++){
     // One client-wide queue also governs callers using Promise.all.
     await pause(attempt?1000*2**(attempt-1):300);
     try{return await Reflect.apply(value,target,args);}catch(error){if(attempt>=3||!rateLimited(error))throw error;}
    }
   });
   tail=result.catch(()=>{});return result;
  });
  return methods.get(key);
 }});
}
