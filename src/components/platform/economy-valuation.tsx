'use client';
import {useState,type FormEvent} from 'react';
import {parseUnits,formatUnits} from 'viem';
import {canonicalJson} from '@/lib/economy/service-contract';
import {api,errorMessage} from './api';
import {useBrowserWallets,signOwnerMessage} from './wallets';
import s from './platform.module.css';
import e from './economy-workspace.module.css';
type Candidate={orderId:string;category:string;output:unknown;productionAccount:unknown;productionAccountHash:string;template:Record<string,unknown>&{resourceCostAtomic:string}};
type ReviewQueue={trusted:boolean;signer:string;message?:string;nextCursor?:string|null;candidates:Candidate[]};
export function EconomyValuation(){
 const wallets=useBrowserWallets(),[walletId,setWalletId]=useState(''),[data,setData]=useState<ReviewQueue|null>(null),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const candidate=data?.candidates.find(c=>c.orderId===selected);
 async function load(reset=true){setBusy(true);setError('');try{const result=await api<ReviewQueue>('/api/economy/valuations'+(!reset&&data?.nextCursor?'?cursor='+encodeURIComponent(data.nextCursor):''));setData({...result,candidates:reset?result.candidates:[...(data?.candidates??[]),...result.candidates]});if(reset||!selected)setSelected(result.candidates[0]?.orderId??'');}catch(caught){setError(errorMessage(caught));}finally{setBusy(false);}}
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setMessage('');try{
  if(!data?.trusted||!candidate)throw Error('Select an output eligible for independent valuation.');const f=new FormData(event.currentTarget),value=String(f.get('value'));
  if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value))throw Error('Enter a nonnegative value with up to six decimal places.');
  const wallet=wallets.find(w=>w.info.uuid===walletId)??wallets[0];if(!wallet)throw Error('Connect the authorized reviewer wallet.');
  const sourceReference=String(f.get('source')),sourceHash=String(f.get('hash')),valuationMethod=String(f.get('method')).trim();
  if(!sourceReference.startsWith('https://')||!/^0x[0-9a-f]{64}$/.test(sourceHash)||valuationMethod.length<20)throw Error('Provide a public evidence URL, content hash and a specific valuation method.');
  const payload={...candidate.template,issuedAt:Math.floor(Date.now()/1000),finalOutputAtomic:parseUnits(value,6).toString(),sourceReference,sourceHash,valuationMethod};
  const signature=await signOwnerMessage(wallet,data.signer,'Obolos economic evidence v1\n'+canonicalJson(payload));
  await api('/api/economy/evidence',{method:'POST',body:JSON.stringify({payload,signature})});setMessage('Independent valuation saved. Refresh economy data to recompute the closed day.');await load();
 }catch(caught){setError(errorMessage(caught));}finally{setBusy(false);}}
 return <details className={e.details}><summary>Review output value for productivity</summary><div className={e.actionPanel}>
 <p>An authorized evaluator reviews the actual output and complete seller cost account, then signs a monetary valuation and its method. Payment size and a second wallet do not establish independent value.</p>
 <button type="button" className={s.secondary} disabled={busy} onClick={()=>void load()}>Load valuation queue</button>
 {data&&!data.trusted&&<p role="status">{data.message}</p>}
 {data?.trusted&&!data.candidates.length&&<p>No eligible outputs. Each output needs complete production accounting, delivery and acknowledgment within a closed UTC day, and no existing valuation.</p>}
 {data?.nextCursor&&<button type="button" className={s.secondary} disabled={busy} onClick={()=>void load(false)}>Load next review page</button>}
 {!!data?.candidates.length&&<form key={selected} onSubmit={submit}>
 <label>Output to review<select value={selected} onChange={event=>setSelected(event.target.value)} disabled={busy}>{data.candidates.map(c=><option key={c.orderId} value={c.orderId}>{c.category} · {c.orderId.slice(0,12)}</option>)}</select></label>
 {candidate&&<><details><summary>Actual delivered output</summary><pre>{JSON.stringify(candidate.output,null,2)}</pre></details><details><summary>Signed production account</summary><pre>{JSON.stringify(candidate.productionAccount,null,2)}</pre></details><p>Complete production cost: {formatUnits(BigInt(candidate.template.resourceCostAtomic),6)} USDC. Account: <code>{candidate.productionAccountHash}</code></p></>}
 <label>Independently assessed output value (USDC)<input name="value" inputMode="decimal" required disabled={busy}/></label>
 <label>Valuation method and currency conversion<textarea name="method" minLength={20} maxLength={2000} required disabled={busy} placeholder="Explain the evidence, comparable value, quality adjustments and currency conversion used."/></label>
 <label>Public valuation evidence URL<input name="source" type="url" required disabled={busy}/></label><label>Evidence content hash (0x SHA-256)<input name="hash" pattern="0x[0-9a-f]{64}" required disabled={busy}/></label>
 <label className={e.checkLabel}><input type="checkbox" required disabled={busy}/> I have reviewed the output and complete costs and am independent of this order's buyer, seller and operators.</label>
 {wallets.length>1&&<label>Reviewer wallet<select value={walletId} onChange={event=>setWalletId(event.target.value)} disabled={busy}>{wallets.map(w=><option key={w.info.uuid} value={w.info.uuid}>{w.info.name}</option>)}</select></label>}
 <p>The signed valuation is immutable and public. Server checks enforce reviewer authorization, known controller relationships and exact output/account binding.</p><button className={s.primary} disabled={busy||!wallets.length}>Sign and submit valuation</button></form>}
 {message&&<p role="status">{message}</p>}{error&&<p role="alert" className={e.formError}>{error}</p>}
 </div></details>;
}
