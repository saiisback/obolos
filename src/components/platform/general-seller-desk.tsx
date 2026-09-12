'use client';

import {useCallback, useEffect, useState} from 'react';
import {formatUnits} from 'viem';
import type {EconomySellerEarnings} from '@/lib/platform/economy-earnings';
import {api, errorMessage} from './api';
import {EconomyServicePublishing} from './economy-market-actions';
import s from './platform.module.css';
import m from './marketplace.module.css';
import t from './general-tasks.module.css';

type PublicationSnapshot = {deployment: {chainId: number; settlement: string; ledger: string}; policy: {reserveBps: string | number; reviewBps: string | number}};
const money = (atomic: string) => `${formatUnits(BigInt(atomic), 6)} test USDC`;

export function GeneralSellerDesk() {
  const [snapshot, setSnapshot] = useState<PublicationSnapshot | null>(null);
  const [earnings, setEarnings] = useState<EconomySellerEarnings | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setErrors([]);
    const [economy, income] = await Promise.allSettled([
      api<{snapshot: PublicationSnapshot | null}>('/api/economy', {signal}),
      api<EconomySellerEarnings>('/api/economy/earnings', {signal}),
    ]);
    if (signal?.aborted) return;
    const issues: string[] = [];
    if (economy.status === 'fulfilled') setSnapshot(economy.value.snapshot); else issues.push(`Service publication setup: ${errorMessage(economy.reason)}`);
    if (income.status === 'fulfilled') setEarnings(income.value); else issues.push(`Seller payments: ${errorMessage(income.reason)}`);
    setErrors(issues); setLoading(false);
  }, []);
  useEffect(() => {const controller = new AbortController(); void load(controller.signal); return () => controller.abort();}, [load]);
  return <section aria-label="Digital service seller desk" className={t.tasks}>
    <div className={t.heading}><div><h3>Sell your capabilities</h3><p>Publish a digital service that other agents can hire. Your endpoint receives paid requests and returns the result.</p></div><button className={s.secondary} disabled={loading} onClick={() => void load()}>Refresh seller payments</button></div>
    {errors.map(message => <p key={message} role="alert" className={s.error}>{message}</p>)}
    {loading && !snapshot && <p role="status">Loading service publication and payments…</p>}
    {snapshot ? <EconomyServicePublishing sellerDesk deployment={snapshot.deployment} reserveBps={snapshot.policy.reserveBps} reviewBps={snapshot.policy.reviewBps}/> : !loading && <p className={t.waiting}>Service registration needs an indexed economy deployment. Refresh after the deployment is configured.</p>}
    <div className={t.heading}><h3>Digital service payments</h3></div>
    {earnings?.totals ? <><p><strong>{money(earnings.totals.sellerAtomic)}</strong> paid to your seller wallet · {earnings.totals.orderCount} settled orders</p><p className={t.hint}>Gross payments {money(earnings.totals.grossAtomic)} · Protocol reserve {money(earnings.totals.reserveAtomic)} · Review pool {money(earnings.totals.reviewAtomic)}. Seller allocation before refunds and operating costs.</p></> : <p className={t.hint}>Indexed seller payment totals are not available yet.</p>}
    {earnings?.indexedAt && <p className={t.hint}>Index updated {new Date(earnings.indexedAt).toLocaleString()}. Totals cover indexed history; the latest 100 orders appear below.</p>}
    {earnings?.orders.map(order => <article key={order.orderId} className={m.purchaseRow}><div><h4>{order.title}</h4><p>{order.quantity} {order.unit} · {new Date(order.settledAt).toLocaleString()}</p><code>{order.orderId}</code></div><div><strong>{money(order.sellerAtomic)}</strong><p>Seller allocation</p><small>Gross {money(order.amountAtomic)}</small></div><a href={`https://testnet.arcscan.app/tx/${order.transactionHash}`} target="_blank" rel="noreferrer">Seller payment receipt</a></article>)}
    {earnings?.totals && earnings.orders.length === 0 && <p className={t.empty}>No indexed payments for your digital services yet.</p>}
  </section>;
}
