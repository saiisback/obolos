/** Checked compatibility shim for Circle CLI 1.0.0's missing raw-calldata option.
 * The upstream HTTP client already supports callData. Authentication, challenge
 * approval, chain selection, fee policy and idempotency remain upstream code.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {encodeFunctionData,parseAbi,type Abi,type Hex} from 'viem';
const supportedVersion='1.0.0';
const supportedSha256='40508e51b251c0c7b696a3ee30f2c21b7052b00b483ec4fc2d64811135ea6df0';
export function patchCircleSource(source:string):string{
 if(createHash('sha256').update(source).digest('hex')!==supportedSha256)throw Error('Circle CLI source differs from reviewed v1.0.0 bundle; adapter review required.');
 const start=source.indexOf('async function handleAgentExecute('),end=source.indexOf('async function handleLocalExecuteEstimate(',start);
 if(start<0||end<0)throw Error('Circle execute function boundary changed.');
 const original=source.slice(start,end);
 const pattern=/abiFunctionSignature,\n\s*abiParameters: abiParameters\.length > 0 \? abiParameters : void 0,/g;
 if([...original.matchAll(pattern)].length!==2)throw Error('Circle request construction changed.');
 const patched=original.replace(pattern,'...(abiFunctionSignature.startsWith("0x") ? { callData: abiFunctionSignature } : { abiFunctionSignature, abiParameters: abiParameters.length > 0 ? abiParameters : void 0 }),');
 return source.slice(0,start)+patched+source.slice(end);
}
export async function circleCalldataAdapter():Promise<string>{
 const packagePath=resolve('node_modules/@circle-fin/cli/package.json');const metadata=JSON.parse(await readFile(packagePath,'utf8')) as {version:string};
 if(metadata.version!==supportedVersion)throw Error('Unreviewed Circle CLI version.');
 const filename=join(dirname(packagePath),'dist/index.js');const patched=patchCircleSource(await readFile(filename,'utf8'));
 const output=join(dirname(filename),`obolos-calldata-${supportedSha256.slice(0,16)}.mjs`);
 try{if(await readFile(output,'utf8')===patched)return output;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 await writeFile(output,patched,{mode:0o600});return output;
}
export function encodeCircleCall(signature:string,parameters:string[]):Hex{
 const args=parameters.map(value=>value.startsWith('[')?JSON.parse(value):value==='true'?true:value==='false'?false:value);
 const abi:Abi=parseAbi([`function ${signature}`] as string[]);
 return encodeFunctionData({abi,functionName:signature.slice(0,signature.indexOf('(')),args});
}
