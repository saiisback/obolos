import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAddress, verifyMessage } from 'viem';
import { z } from 'zod';

export function approvalMessage(value:unknown):string {
  const input=z.object({message:z.string().min(1).max(12000)}).parse(value);
  if(!input.message.startsWith('AgentGDP mandate authorization\n')||!input.message.includes('\nMode: live\n'))throw Error('Expected an AgentGDP live mandate approval message.');
  return input.message; // Sign the exact UTF-8 bytes; never reconstruct or normalize the mandate.
}
async function main() {
  const filename=process.argv[2];
  if(!filename||filename==='--help'){
    console.log('Usage: npm run ledger:approve -- /absolute/path/approval.json\nJSON must contain the exact message exported by the live approval request. Connect your Ledger and open Ethereum. LEDGER_CONTROLLER_ADDRESS must be pinned in the environment.');return;
  }
  const message=approvalMessage(JSON.parse(await readFile(resolve(filename),'utf8')));
  const address=process.env.LEDGER_CONTROLLER_ADDRESS;
  if(!address||!isAddress(address))throw Error('Pin LEDGER_CONTROLLER_ADDRESS before signing.');
  const path=process.env.LEDGER_DERIVATION_PATH||"44'/60'/0'/0/0";
  if(!/^44'\/60'\/\d+'\/\d+\/\d+$/.test(path))throw Error('Invalid Ethereum derivation path.');
  const [{default:Transport},{default:Eth}]=await Promise.all([import('@ledgerhq/hw-transport-node-hid'),import('@ledgerhq/hw-app-eth')]);
  const transport=await Transport.create();
  try {
    const eth=new Eth(transport);
    const derived=await eth.getAddress(path,true);
    if(derived.address.toLowerCase()!==address.toLowerCase())throw Error('Ledger address differs from pinned controller.');
    console.error('Review this exact authorization and confirm the message on your Ledger:\n'+message);
    const signed=await eth.signPersonalMessage(path,Buffer.from(message,'utf8').toString('hex'));
    const signature=`0x${signed.r}${signed.s}${signed.v.toString(16).padStart(2,'0')}` as `0x${string}`;
    if(!await verifyMessage({address:address as `0x${string}`,message,signature}))throw Error('Device signature verification failed.');
    console.log(JSON.stringify({address,signature,message}));
  } finally {await transport.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('Ledger approval failed. Confirm configuration, exact approval file, USB connection, Ethereum app, and device review.');process.exitCode=1;});
