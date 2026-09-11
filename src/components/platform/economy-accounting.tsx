'use client';
import {useState,type FormEvent} from 'react';
import {formatUnits,parseUnits} from 'viem';
import {productionAccountSchema,productionAccountMessage,productionAccountTotals} from '@/lib/economy/production-account';
import {api,errorMessage} from './api';
import {useBrowserWallets,signOwnerMessage} from './wallets';
import s from './platform.module.css';
import e from './economy-workspace.module.css';
type Sales={seller:string;deployment:{settlement:string;ledger:string};sales:{orderId:string;transactionHash:string;outputHash:string|null;category:string;amountAtomic:string;accounted:boolean}[]};
const atomic=(value:FormDataEntryValue|null)=>{const text=String(value??'');if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(text))throw Error('Enter each cost in USDC with up to six decimal places; enter 0 only for a known zero cost.');return parseUnits(text,6).toString();};
export function EconomyAccounting(){
 const wallets=useBrowserWallets();const [walletId,setWalletId]=useState(''),[data,setData]=useState<Sales|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 async function load(){setBusy(true);setError('');try{setData(await api<Sales>('/api/economy/accounting'));}catch(caught){setError(errorMessage(caught));}finally{setBusy(false);}}
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setMessage('');try{
  if(!data)throw Error('Load your sales first.');const wallet=wallets.find(w=>w.info.uuid===walletId)??wallets[0];if(!wallet)throw Error('Connect the seller wallet to sign its production account.');const f=new FormData(event.currentTarget),sale=data.sales.find(o=>o.orderId===f.get('order'));if(!sale?.outputHash)throw Error('Choose a delivered sale.');
  const inputs=String(f.get('inputs')??'').trim().split('\n').filter(Boolean).map(line=>{const [orderId,value,...extra]=line.trim().split(/\s+/);if(!value||extra.length)throw Error('Enter one input order ID and its allocated USDC amount per line.');return {orderId,amountAtomic:atomic(value)};});
  const payload=productionAccountSchema.parse({protocol:'obolos.production-account.v1',chainId:5042002,settlement:data.deployment.settlement,ledger:data.deployment.ledger,orderId:sale.orderId,transactionHash:sale.transactionHash,outputHash:sale.outputHash,seller:data.seller,issuedAt:Math.floor(Date.now()/1000),inputs,externalIntermediateAtomic:atomic(f.get('external')),gasAtomic:atomic(f.get('gas')),inferenceAtomic:atomic(f.get('inference')),otherResourceAtomic:atomic(f.get('other')),allIntermediateInputsIncluded:f.get('completeInputs')==='on',allResourcesIncluded:f.get('completeCosts')==='on',sourceReference:String(f.get('source')),sourceHash:String(f.get('hash'))});
  productionAccountTotals(payload);
  const signature=await signOwnerMessage(wallet,data.seller,productionAccountMessage(payload));await api('/api/economy/accounting',{method:'POST',body:JSON.stringify({payload,signature})});setMessage('Production account saved. The next economy refresh will apply the recorded inputs and costs.');await load();
 }catch(caught){setError(errorMessage(caught));}finally{setBusy(false);}}
 return <details className={e.details}><summary>Record production inputs and costs</summary><div className={e.actionPanel}><p>Revenue comes from the sale receipt. As the producer, link consumed purchases and document external costs. These signed accounting statements are producer reports; output-quality reviews remain separate.</p><button type="button" className={s.secondary} disabled={busy} onClick={()=>void load()}>{busy?'Loading…':'Load my sales'}</button>
 {data&&<>{data.sales.filter(o=>o.outputHash&&!o.accounted).length===0?<p>No delivered sales need accounting for this wallet.</p>:<form onSubmit={submit}>
 <label>Delivered sale<select name="order" required disabled={busy}>{data.sales.filter(o=>o.outputHash&&!o.accounted).map(o=><option key={o.orderId} value={o.orderId}>{o.category} · {formatUnits(BigInt(o.amountAtomic),6)} USDC · {o.orderId.slice(0,10)}</option>)}</select></label>
 <label>Consumed input purchases<textarea name="inputs" rows={3} placeholder="Input order ID followed by allocated USDC amount, one per line" disabled={busy}/></label><p>Leave empty only when no marketplace purchase was consumed. You may split a purchase across outputs; total allocations cannot exceed the paid amount. Input costs already listed here must not be repeated below.</p>
 <label>Other intermediate inputs (USDC)<input name="external" inputMode="decimal" placeholder="Include external purchased inputs; enter 0 if none" required disabled={busy}/></label>
 <label>Gas cost (USDC)<input name="gas" inputMode="decimal" required disabled={busy}/></label><label>Inference cost not included above (USDC)<input name="inference" inputMode="decimal" required disabled={busy}/></label><label>Other resources not included above (USDC)<input name="other" inputMode="decimal" required disabled={busy}/></label>
 <label>Public cost evidence URL<input name="source" type="url" required disabled={busy}/></label><label>Evidence content hash (0x SHA-256)<input name="hash" pattern="0x[0-9a-f]{64}" required disabled={busy}/></label>
 <label className={e.checkLabel}><input name="completeInputs" type="checkbox" disabled={busy}/> All intermediate inputs are included</label><label className={e.checkLabel}><input name="completeCosts" type="checkbox" disabled={busy}/> All consumed resources are included, including hosting, energy and conversions where applicable</label>
 <p>Unchecked means incomplete, not zero. Saved statements are immutable and public. Keep confidential invoices and credentials out of the evidence URL.</p>
 {wallets.length>1&&<label>Seller wallet<select value={walletId} onChange={event=>setWalletId(event.target.value)} disabled={busy}>{wallets.map(w=><option key={w.info.uuid} value={w.info.uuid}>{w.info.name}</option>)}</select></label>}
 <button className={s.primary} disabled={busy||wallets.length===0}>{busy?'Saving…':'Sign and save production account'}</button></form>}</>}
 {message&&<p role="status">{message}</p>}{error&&<p role="alert" className={e.formError}>{error}</p>}</div></details>;
}
