'use client';

import Link from 'next/link';
import {useCallback, useEffect, useState} from 'react';
import {formatUnits} from 'viem';
import type {ServiceDefinition} from '@/lib/economy/service-contract';
import type {EconomyPurchases} from '@/lib/platform/economy-purchases';
import {api, errorMessage} from './api';
import s from './platform.module.css';
import {WorkspaceGlyph} from './workspace-glyph';
import m from './marketplace.module.css';

type ProviderHealth = {seller: string; status: string; endpoints?: string[]; lastSeen?: string | null};
const categoryNames: Record<string, string> = {data: 'Data', compute: 'Compute', inference: 'Inference', verification: 'Verification', storage: 'Storage'};
const usdc = (atomic: string | bigint) => formatUnits(BigInt(atomic), 6);
const receiptUrl = (hash: string) => `https://testnet.arcscan.app/tx/${hash}`;

export function ResourceMarketplace() {
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [profiles, setProfiles] = useState<{serviceHash:string;title:string;description:string;tags:string[];examples:unknown[]}[]>([]);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const load = useCallback(async () => {
    setLoading(true); setError(''); setHealth(null);
    const [catalog, provider, metadata] = await Promise.allSettled([
      api<{services: ServiceDefinition[]}>('/api/economy/services'),
      api<ProviderHealth>('/api/economy/provider/status'),
      api<{profiles:{serviceHash:string;title:string;description:string;tags:string[];examples:unknown[]}[]}>('/api/economy/service-profiles'),
    ]);
    if (catalog.status === 'fulfilled') setServices(catalog.value.services ?? []);
    else {setServices([]); setError(errorMessage(catalog.reason));}
    if (provider.status === 'fulfilled') setHealth(provider.value);
    setProfiles(metadata.status === 'fulfilled' ? metadata.value.profiles ?? [] : []);
    setLoading(false);
  }, []);
  useEffect(() => {void load();}, [load]);
  const visible = services.filter(service => category === 'all' || service.category === category);
  return <section aria-label="Resource services" className={m.resources} aria-busy={loading}>
    <div className={m.catalogHeading}><div><h2 id="resource-catalog-heading">Resource services <span className={s.count}>{loading ? '—' : services.length}</span></h2><p>Published data, compute, inference, verification, and storage offers. Review the exact terms before execution.</p></div><button className={s.secondary} disabled={loading} onClick={() => void load()}>Refresh resources</button></div>
    <div className={m.resourceIntro}><details className={m.executionGuide}><summary>How resource purchases work</summary><p>Resource purchases use an owner-authorized, funded private executor. Circle execution runs locally; this catalog does not initiate payments.</p><Link href="/app/developers#selling">Resource execution guide</Link></details><label>Resource category<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{Object.entries(categoryNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
    {error ? <p role="alert" className={s.error}>{error}</p> : loading ? <p role="status">Loading published resources…</p> : !visible.length ? <p className={s.empty}>No published resource services in this category.</p> : <div className={`${m.grid} ${m.resourceGrid}`}>{visible.map(service => {
      const profile = profiles.find(item => item.serviceHash === service.serviceHash);
      const bound = health?.seller?.toLowerCase() === service.seller.toLowerCase() && health?.endpoints?.includes(service.endpoint);
      const status = bound && health?.status === 'online' ? 'Provider online' : bound && health?.status === 'unavailable' ? 'Provider unavailable' : 'Provider status unknown';
      return <article className={m.card} key={service.serviceHash}>
        <div className={m.serviceInfo}><div className={m.serviceType}><WorkspaceGlyph kind={service.category} compact/><span>{status}</span></div><div className={m.resourceTitle}><div><h3>{profile?.title ?? categoryNames[service.category]}</h3><p className={m.resourceUnit}>{service.unit.replaceAll("-", " ")}</p></div><div className={m.inlinePrice}><strong>{usdc(BigInt(service.quantity)*BigInt(service.unitPriceAtomic))}</strong><span>test USDC / order</span></div></div>{profile && <p>{profile.description}</p>}<dl><div><dt>Seller</dt><dd><a href={`https://testnet.arcscan.app/address/${service.seller}`} title={service.seller}>{service.seller.slice(0, 8)}…{service.seller.slice(-6)}</a></dd></div><div><dt>Quantity</dt><dd>{service.quantity} {service.unit}</dd></div><div><dt>Unit price</dt><dd>{usdc(service.unitPriceAtomic)} test USDC</dd></div></dl><p className={m.endpointLabel}><span>Provider endpoint</span><code>{service.endpoint}</code></p>
          <details className={m.resourceTerms}><summary>Exact service terms</summary><p>Service hash</p><code>{service.serviceHash}</code><pre>{JSON.stringify(service, null, 2)}</pre><a href={`/api/economy/services/${service.serviceHash}`} target="_blank" rel="noreferrer">Published source definition</a></details>
        </div><div className={m.purchase}><Link className={s.primary} href={`/app?taskService=${encodeURIComponent(service.serviceHash)}`}>Use in a task</Link><p>Per order · {service.quantity} {service.unit}</p><small>{status === 'Provider online' ? 'Recent provider heartbeat. Delivery still requires a paid, accepted request.' : status === 'Provider unavailable' ? 'Provider heartbeat is missing or stale. Restore the provider before new work.' : 'Availability has not been verified for this endpoint.'}</small></div>
      </article>;
    })}</div>}
  </section>;
}

export function ResourcePurchases() {
  const [data, setData] = useState<EconomyPurchases | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(''); setData(null);
    try {setData(await api<EconomyPurchases>('/api/economy/purchases'));}
    catch (caught) {setError(errorMessage(caught));}
    finally {setLoading(false);}
  }, []);
  useEffect(() => {void load();}, [load]);
  return <section aria-label="Resource purchases" className={m.resources}>
    <div className={m.catalogHeading}><div><h2>Resource purchases</h2><p>Latest 100 resource orders for your agents, with provider outputs and separately indexed ledger receipts.</p></div><button className={s.secondary} disabled={loading} onClick={() => void load()}>Refresh resource orders</button></div>
    {error ? <p className={s.error} role="alert">{error}</p> : loading ? <p role="status">Loading resource orders…</p> : !data?.orders.length ? <p className={s.empty}>No resource orders for your agents yet.</p> : <>
      <p className={s.caption}>{data.indexedAt ? `Ledger index updated ${new Date(data.indexedAt).toLocaleString()}.` : 'Ledger index timestamp unavailable.'} An unindexed receipt may still be awaiting an index refresh.</p>
      {data.orders.map(order => <article key={order.orderId} className={m.purchaseRow}>
        <div><h3>{categoryNames[order.category] ?? order.category} · {order.unit}</h3><p>{order.agentName} · {new Date(order.createdAt).toLocaleString()}</p><code>{order.orderId}</code><p>Quantity {order.quantity} · Seller {order.seller}</p></div>
        <div><strong>{usdc(order.amountAtomic)} USDC</strong><div className={m.receiptStates}><span className={s.tag}>Payment finalized</span><span className={s.tag}>{order.state === 'fulfilled' ? 'Output received' : order.state === 'delivering' ? 'Provider delivery in progress' : 'Provider delivery pending'}</span><span className={s.tag}>{order.sellerAttestation ? 'Seller delivery attested' : 'Seller delivery not indexed'}</span><span className={s.tag}>{order.buyerAcknowledgment ? 'Buyer acknowledged' : 'Buyer acknowledgment not indexed'}</span></div></div>
        <div className={m.orderActions}><a href={receiptUrl(order.transactionHash)} target="_blank" rel="noreferrer">Payment receipt</a>{order.sellerAttestation && <a href={receiptUrl(order.sellerAttestation.transactionHash)} target="_blank" rel="noreferrer">Seller delivery receipt</a>}{order.buyerAcknowledgment && <a href={receiptUrl(order.buyerAcknowledgment.transactionHash)} target="_blank" rel="noreferrer">Buyer acknowledgment receipt</a>}<a href={`/api/economy/services/${order.serviceHash}`} target="_blank" rel="noreferrer">Purchased service terms</a><Link href="/app/economy#settlements">Order delivery and recovery</Link><Link href="/app">Manage agents</Link></div>
      </article>)}
    </>}
  </section>;
}
