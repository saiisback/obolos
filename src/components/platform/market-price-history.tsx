'use client';
import {useState} from 'react';
import {api, errorMessage, fromAtomic} from './api';
import type {MarketServiceRevision} from '@/lib/market/contracts';
import {priceChangeLabel} from '@/lib/market/price-state';
import m from './marketplace.module.css';

export function MarketPriceHistory({serviceId}: {serviceId: string}) {
  const [history, setHistory] = useState<MarketServiceRevision[] | null>(null);
  const [loading, setLoading] = useState(false), [error,setError] = useState('');
  async function load() {setLoading(true);setError('');try{const result=await api<{revisions:MarketServiceRevision[]}>(`/api/market/services/${serviceId}/history`);setHistory(result.revisions);}catch(e){setError(errorMessage(e));}finally{setLoading(false);}}
  return <details className={m.priceHistory} onToggle={event=>{if(event.currentTarget.open && !history && !loading && !error)void load();}}><summary>Price & revision history</summary>
    {loading ? <p role="status">Loading recorded terms…</p> : error ? <p role="alert">{error} <button onClick={()=>void load()}>Retry</button></p> : history && <><ol>{history.map((row,index)=><li key={row.revision}><div><strong>Revision {row.revision}</strong><span>{row.active ? 'Active' : 'Paused'} · {new Date(row.recordedAt).toLocaleDateString()}</span></div><div><strong>{fromAtomic(row.priceAtomic,6)} USDC</strong><span>{history[index+1] ? priceChangeLabel(history[index+1].priceAtomic,row.priceAtomic) : 'First recorded terms'}</span></div>{row.source==='backfill' && <small>Recorded when history became available; earlier edits are not reconstructed.</small>}</li>)}</ol><p>Every saved edit creates a revision. Existing mandates must be reviewed and signed again before buying changed terms.</p></>}
  </details>;
}
