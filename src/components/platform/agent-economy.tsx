'use client';

import {useEffect, useState} from 'react';
import {formatUnits} from 'viem';
import type {AgentEconomy as Activity} from '@/lib/platform/agent-economy';
import {api, errorMessage} from './api';
import s from './platform.module.css';

const amount = (value: string) => `${formatUnits(BigInt(value), 6)} test USDC`;
function Receipt({hash, children}: {hash: string; children: React.ReactNode}) {
  return /^0x[\da-f]{64}$/i.test(hash) ? <a href={`https://testnet.arcscan.app/tx/${hash}`} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <span>{children}</span>;
}

export function AgentEconomy({agentId}: {agentId: string}) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api<Activity>(`/api/agents/${agentId}/economy`, {signal: controller.signal}).then(value => {if (!controller.signal.aborted) setActivity(value);}).catch(caught => {if (!controller.signal.aborted) setError(errorMessage(caught));}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [agentId, revision]);
  const policy = activity?.policy;
  return <section className={s.execution} aria-label="Economy activity">
    <div className={s.sectionHeading}><div><h3>Economy activity</h3><p>Paid resource orders and finalized spending authorization.</p></div><button className={s.secondary} disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? 'Refreshing economy…' : 'Refresh economy'}</button></div>
    {error && <p className={s.error} role="alert">{error}</p>}
    {loading && !activity && <p role="status">Loading economy orders and policy…</p>}
    {policy?.status === 'registered' ? <div className={s.mandateSummary}>
      <h4>{policy.active ? 'Registered · Authorization active' : 'Registered · Authorization inactive'}</h4>
      <p>Registration authorizes the executor within on-chain limits. It does not confirm that an agent process is running.</p>
      <p><strong>Total cap:</strong> {amount(policy.totalCapAtomic)} · <strong>Spent:</strong> {amount(policy.spentAtomic)}</p>
      <p><strong>Window cap:</strong> {amount(policy.windowCapAtomic)} per {policy.windowSeconds} seconds</p>
      <p>Executor <code>{policy.executor}</code></p><p>Finalized block {policy.blockNumber} · {new Date(policy.timestamp * 1000).toLocaleString()}</p>
      <p>Category and counterparty policy also applies. Repository research budget settings below do not control these economy caps.</p>
    </div> : policy && <p role="status">{policy.status === 'unavailable' ? 'On-chain policy is unavailable. Your saved orders remain visible; refresh to check authorization.' : policy.status === 'owner_mismatch' ? 'The on-chain registration belongs to a different owner. Its authorization is not available here.' : policy.status === 'not_deployed' ? 'Economy contracts are not deployed.' : 'This agent has no finalized economy registration yet.'}</p>}
    {activity && <><p className={s.caption}>Seller and buyer receipts reflect finalized indexed evidence{activity.indexedAt ? ` last refreshed ${new Date(activity.indexedAt).toLocaleString()}` : '; the index has not been refreshed'}. An absent receipt means it has not been observed in this index.</p>
      {activity.orders.length === 0 ? <p>No economy orders recorded for this agent.</p> : <div className={s.jobList}>{activity.orders.map(order => <article className={s.jobResult} key={order.orderId}>
        <div className={s.receiptRow}><div><strong>{order.category} · {amount(order.amountAtomic)}</strong><p>{new Date(order.createdAt).toLocaleString()}</p><code>{order.orderId}</code></div><Receipt hash={order.transactionHash}>Payment receipt</Receipt></div>
        <div className={s.jobBody}><p><strong>Provider delivery:</strong> {order.providerState === 'fulfilled' ? 'Output received' : order.providerState === 'delivering' ? 'Delivery in progress' : 'Paid · awaiting output'} · {order.deliveryAttempts} attempt{order.deliveryAttempts === 1 ? '' : 's'}</p>
          {order.outputSummary && <p>{order.outputSummary}</p>}
          <p><strong>Seller attestation:</strong> {order.sellerAttestation ? <Receipt hash={order.sellerAttestation.transactionHash}>Recorded · {order.sellerAttestation.outputMatches === true ? "output matches" : order.sellerAttestation.outputMatches === false ? "output mismatch" : "output comparison unavailable"}</Receipt> : 'Not observed'}</p>
          <p><strong>Buyer acknowledgment:</strong> {order.buyerAcknowledgment ? <Receipt hash={order.buyerAcknowledgment.transactionHash}>Recorded · {order.buyerAcknowledgment.outputMatches === true ? "output matches" : order.buyerAcknowledgment.outputMatches === false ? "output mismatch" : "output comparison unavailable"}</Receipt> : 'Not observed'}</p>
          {order.outputHash && order.sellerAttestation && order.outputHash !== order.sellerAttestation.outputHash && <p role="alert">Provider output does not match the seller’s attested output hash.</p>}
          {order.sellerAttestation && order.buyerAcknowledgment && order.sellerAttestation.outputHash !== order.buyerAcknowledgment.outputHash && <p role="alert">Seller and buyer output hashes do not match.</p>}
          <a href={`/api/economy/orders/${order.orderId}`} target="_blank" rel="noopener noreferrer">Open owned order and output JSON ↗</a>
        </div>
      </article>)}</div>}
      {activity.orders.length === 100 && <p>Showing the latest 100 orders.</p>}
    </>}
  </section>;
}
