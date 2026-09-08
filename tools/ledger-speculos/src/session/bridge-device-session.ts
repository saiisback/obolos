import { openTransport,closeTransport } from '../device/speculos';
export async function withLkrpDeviceSession<T>(fn:()=>Promise<T>):Promise<T>{await openTransport();try{return await fn();}finally{await closeTransport();}}
