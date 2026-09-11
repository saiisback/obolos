'use client';

import Link from 'next/link';
import {useEffect, useState, type ReactNode} from 'react';
import {ArrowUpRight, RefreshCw} from 'lucide-react';
import {formatUnits, keccak256, toHex} from 'viem';
import type {EconomyMeasurements} from '@/lib/economy/measurements';
import {EconomyMeasurementsView} from './economy-measurements';
import {EconomyAccounting} from './economy-accounting';
import type {EconomyMetrics} from '@/lib/economy/model';
import {api, errorMessage} from './api';
import {WorkspaceSections, useWorkspaceSection} from './workspace-sections';
import {EconomyServicePublishing, EconomyOrderDelivery} from './economy-market-actions';
import s from './platform.module.css';
import e from './economy-workspace.module.css';

type JsonNumbers<T> = T extends bigint ? string : T extends (infer U)[] ? JsonNumbers<U>[] : T extends object ? {[K in keyof T]: JsonNumbers<T[K]>} : T;
type Integer = string | number;
type Snapshot = {
  deployment: {chainId: number; policy: string; ledger: string; settlement: string; controller: string; approver: string; reserve: string; reviewPool: string};
  blockNumber: string; indexedAt: string; chainTimestamp: number; caughtUp: boolean;
  metrics: JsonNumbers<EconomyMetrics>;
  measurements?: JsonNumbers<EconomyMeasurements>;
  currentAccounting?: JsonNumbers<EconomyMetrics>;
  currentAccountingCoverage?: {eligibleOrderCount:number;currentRevenueOrderCount:number;currentInputAccountCount:number;currentCostAccountCount:number;currentValuedOutputCount:number};
  policy: {enabled: boolean; reserveBps: Integer; reviewBps: Integer; policyVersion: Integer; feeVersion: Integer; categories: {name: string; enabled: boolean; perOrderCap: string; windowCap: string; windowSeconds: Integer; delaySeconds: Integer}[]};
  services: {serviceHash: string; seller: string; unitHash: string; unitPrice: string; quantity: string; endpointHash: string; category: string; transactionHash: string}[];
  reputation: {seller: string; paid: string; delivered: string; acknowledged: string; acceptanceBps: string | null; qualityScore: string | null}[];
  orders: {orderId: string; agentId: string; seller: string; principalAtomic: string; sellerAtomic: string; delivered: boolean; buyerAcknowledged: boolean; transactionHash: string}[];
  policyHistory: {version: string; actionHash: string; observationHash: string; actor: string; approvalDigest: string; transactionHash: string}[];
  observations?: {observationHash: string; metricId: string; windowStart: string; windowEnd: string; value: string; baseline: string; inputRoot: string; methodologyHash: string; transactionHash: string}[];
};
type EconomyResponse = {status: 'not_deployed' | 'awaiting_index' | 'indexed'; snapshot: Snapshot | null};

function decimal(value: Integer | null | undefined, places: number, suffix = '') {
  return value == null ? 'Unavailable' : `${formatUnits(BigInt(value), places)}${suffix}`;
}
const money = (value: string | null) => decimal(value, 6, ' USDC');
const percent = (value: Integer | null) => decimal(value, 2, '%');
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const date = (seconds: number) => new Date(seconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
const arpiMetricId = keccak256(toHex('ARPI:USDC'));
function indexValue(value: string) {
  const [whole, fraction = ''] = formatUnits(BigInt(value), 2).split('.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function Explorer({value, kind = 'address', children}: {value: string; kind?: 'address' | 'tx' | 'block'; children?: ReactNode}) {
  const valid = kind === 'block' ? /^\d+$/.test(value) : new RegExp(`^0x[\\da-f]{${kind === 'address' ? 40 : 64}}$`, 'i').test(value);
  return valid ? <a className={e.explorer} href={`https://testnet.arcscan.app/${kind}/${value}`} target="_blank" rel="noopener noreferrer" title={value}>{children ?? short(value)}<ArrowUpRight size={13} aria-hidden="true"/><span className={e.srOnly}> (opens explorer in a new tab)</span></a> : <span title={value}>{children ?? short(value)}</span>;
}

function DataTable({label, children}: {label: string; children: ReactNode}) {
  return <div className={e.tableScroll} tabIndex={0} role="region" aria-label={label}><table className={e.table}>{children}</table></div>;
}

function Prices({snapshot}: {snapshot: Snapshot}) {
  const m = snapshot.currentAccounting ?? snapshot.metrics;
  const coverage=snapshot.currentAccountingCoverage;
  const accountingRows = (m:JsonNumbers<EconomyMetrics>,current=false) => [
    ['Gross Agent Product (GAP)', m.gapAtomic===null?'Input accounting pending':money(m.gapAtomic), m.methodology==='obolos-agentgdp-v2'?'Paper equations 8–9: observed seller revenue minus complete intermediate inputs.':'Historical v1 calculation; refresh to load corrected v2 accounting.'],
    ['Agent surplus', m.surplusAtomic===null?'Cost accounting pending':money(m.surplusAtomic), m.methodology==='obolos-agentgdp-v2'?'Paper equation 2: observed seller revenue minus complete resource cost.':'Historical v1 calculation; refresh to load corrected v2 accounting.'],
    ['Productivity', m.productivityBps===null?(current?'After UTC close and output assessment':'Output assessment pending'):percent(m.productivityBps), 'Paper equation 3: verified output value divided by consumed resource cost.'],
    ['Money velocity', m.moneyVelocityBps===null?(current?'After UTC close and capital accounting':'Value-added / capital pending'):decimal(m.moneyVelocityBps,4,'×'), 'Paper equation 14: GAP divided by attested accounting capital for the same scope. Active executor balances are a separate measurement.'],
  ];
  const rows=accountingRows(m,Boolean(snapshot.currentAccounting));
  return <>
    {snapshot.measurements ? <EconomyMeasurementsView value={snapshot.measurements}/> : <p className={e.empty}>The new measurement collector is awaiting its first finalized refresh.</p>}
    <section className={e.section}><div className={e.sectionHeading}><h2>Production accounting</h2><p>{date(m.start)} to {date(m.end-1)} · {snapshot.currentAccounting?'Today through the indexed block':'Closed UTC day'}. Gross seller allocations are revenue observations before refund adjustments; they are not independent output valuations.</p></div>
    {coverage&&<p className={e.caption}>{coverage.currentRevenueOrderCount} of {coverage.eligibleOrderCount} eligible orders have recognized revenue; {coverage.currentInputAccountCount} have complete input accounts; {coverage.currentCostAccountCount} have complete cost accounts; {coverage.currentValuedOutputCount} have assessed output values.</p>}
    <DataTable label="Production accounting metrics"><thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">Formula and source</th></tr></thead><tbody>{rows.map(([label,value,detail])=><tr key={label}><th scope="row">{label}</th><td className={e.value}>{value}</td><td className={e.explanation}>{detail}</td></tr>)}</tbody></DataTable>
    <p className={e.caption}>Independent output assessments and economic-capital attestations are recorded after a UTC day closes. Their completed results appear under Previous closed UTC day below.</p>
    <EconomyAccounting/>
    </section>
    <details className={e.details}><summary>Previous closed UTC day</summary><p>{date(snapshot.metrics.start)} to {date(snapshot.metrics.end)} (end exclusive). Today's transactions are outside this window. This is the latest indexed accounting projection as of finalized block {snapshot.blockNumber}; later evidence can revise it. Seller allocations and accounting results are before separate refund adjustments.</p><dl className={e.addresses}><div><dt>Gross payments</dt><dd>{money(snapshot.metrics.grossPaymentsAtomic)}</dd></div><div><dt>Seller allocations</dt><dd>{money(snapshot.metrics.sellerRevenueAtomic)}</dd></div><div><dt>Settlements</dt><dd>{snapshot.metrics.settlementCount}</dd></div><div><dt>Eligible orders</dt><dd>{snapshot.metrics.settlementCount-snapshot.metrics.excludedSelfPayments}</dd></div><div><dt>Assessed outputs</dt><dd>{snapshot.metrics.valuedSettlementCount}</dd></div></dl><p>Methodology: {snapshot.metrics.methodology}. Values require complete evidence for this closed day.</p><DataTable label="Closed-day economics"><thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">Formula and source</th></tr></thead><tbody>{accountingRows(snapshot.metrics).map(([label,value,detail])=><tr key={label}><th scope="row">{label}</th><td className={e.value}>{value}</td><td className={e.explanation}>{detail}</td></tr>)}</tbody></DataTable>{snapshot.metrics.limitations.length>0&&<ul>{snapshot.metrics.limitations.map((limitation,index)=><li key={index}>{limitation}</li>)}</ul>}</details>
    <details className={e.details}><summary>Measurement limitations</summary><p>Settlement, seller delivery claims and buyer acknowledgments are separate evidence. None independently proves useful output or excludes collusion.</p>{m.limitations.length > 0 && <ul>{m.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}</details>
    <section className={e.section}><h2>On-chain observations</h2><p>These historical attestations retain their original recorded windows and methodology. Selected-quote ARPI uses selected immutable service quotes, not market-clearing prices. Its presence does not fill missing closed-day evidence.</p>{!snapshot.observations?.length ? <p className={e.empty}>No on-chain observations have been indexed yet.</p> : <DataTable label="On-chain metric observation evidence"><thead><tr><th scope="col">Measure / observation</th><th scope="col">Value / baseline</th><th scope="col">Recorded UTC window</th><th scope="col">Input / methodology</th><th scope="col">Evidence</th></tr></thead><tbody>{[...snapshot.observations].reverse().map(observation => {
      const isArpi = observation.metricId.toLowerCase() === arpiMetricId;
      return <tr key={observation.observationHash}><th scope="row"><span title={observation.metricId}>{isArpi ? 'Selected-quote ARPI' : short(observation.metricId)}</span><code className={e.subline} title={observation.observationHash}>{short(observation.observationHash)}</code></th><td className={e.value}>{isArpi ? indexValue(observation.value) : `${observation.value} (raw)`}<span className={e.subline}>Baseline: {isArpi ? indexValue(observation.baseline) : observation.baseline}</span></td><td>{date(Number(observation.windowStart))}<span className={e.subline}>to {date(Number(observation.windowEnd))}</span></td><td><code title={observation.inputRoot}>Input: {short(observation.inputRoot)}</code><code className={e.subline} title={observation.methodologyHash}>Method: {short(observation.methodologyHash)}</code></td><td><Explorer value={observation.transactionHash} kind="tx">Observation</Explorer></td></tr>;
    })}</tbody></DataTable>}</section>
    <section className={e.section}><h2>Registered service terms</h2><p>Immutable registrations through the indexed block. Each new price or endpoint creates a separate service hash; these are not executable quotes.</p>{snapshot.services.length === 0 ? <p className={e.empty}>No service registrations have been indexed. <Link href="/app/marketplace">Browse the marketplace</Link> for published endpoints.</p> : <DataTable label="Registered service terms"><thead><tr><th scope="col">Category / service</th><th scope="col">Seller</th><th scope="col">Unit price</th><th scope="col">Quantity / unit</th><th scope="col">Evidence</th></tr></thead><tbody>{[...snapshot.services].reverse().map(service => <tr key={service.serviceHash}><th scope="row"><span className={e.capitalize}>{service.category}</span><code className={e.subline} title={service.serviceHash}>{short(service.serviceHash)}</code></th><td><Explorer value={service.seller}/></td><td className={e.value}>{money(service.unitPrice)}</td><td>{service.quantity}<code className={e.subline} title={service.unitHash}>{short(service.unitHash)}</code></td><td><Explorer value={service.transactionHash} kind="tx">Registration</Explorer></td></tr>)}</tbody></DataTable>}</section>
    <EconomyServicePublishing deployment={snapshot.deployment} reserveBps={snapshot.policy.reserveBps} reviewBps={snapshot.policy.reviewBps}/>
  </>;
}

function Rules({snapshot}: {snapshot: Snapshot}) {
  const {policy, deployment} = snapshot;
  const sellerBps = (10000n - BigInt(policy.reserveBps) - BigInt(policy.reviewBps)).toString();
  const addresses = [['Policy contract', deployment.policy], ['Settlement contract', deployment.settlement], ['Economic ledger', deployment.ledger], ['Controller', deployment.controller], ['Human approver', deployment.approver], ['Reserve recipient', deployment.reserve], ['Review-pool recipient', deployment.reviewPool]];
  return <>
    <div className={e.sectionHeading}><h2>Spending rules</h2><p>Market {policy.enabled ? 'enabled' : 'paused'} · policy version {policy.policyVersion} · fee version {policy.feeVersion}. State at the indexed block.</p></div>
    <div className={e.ruleIntro}><p>The human owner sets the agent’s budget and permitted sellers. The Circle executor spends within that mandate. Material market policy changes require the authorized approver’s signature, submitted by the controller.</p><p>Speculos is a development emulator, not a physical Ledger. A valid on-chain signature proves the signing identity and payload; it does not prove hardware provenance.</p></div>
    <h3>Payment allocation</h3>
    <dl className={e.allocation}>{[['Seller', percent(sellerBps)], ['Protocol reserve', percent(policy.reserveBps)], ['Review pool', percent(policy.reviewBps)], ['Buyer rebate', '0%']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className={e.caption}>The approved testnet split is a product policy. The seller receives rounding dust. Review-pool proceeds do not automatically pay verifier wages.</p>
    <section className={e.section}><h2>Category limits</h2><p>Agent mandates apply additional caps and seller permissions. Windows are fixed-duration, anchored at first spend; they are not rolling windows.</p><DataTable label="Category spending limits"><thead><tr><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Per order</th><th scope="col">Per window</th><th scope="col">Window</th><th scope="col">Minimum delay</th></tr></thead><tbody>{policy.categories.map(category => <tr key={category.name}><th scope="row" className={e.capitalize}>{category.name}</th><td>{category.enabled ? 'Enabled' : 'Disabled'}</td><td className={e.value}>{money(category.perOrderCap)}</td><td className={e.value}>{money(category.windowCap)}</td><td>{category.windowSeconds} sec</td><td>{category.delaySeconds} sec</td></tr>)}</tbody></DataTable></section>
    <section className={e.section}><h2>Policy history</h2><p>Signed changes retain their approval digest and triggering observation. Emergency and owner actions may have no separate approval digest.</p>{snapshot.policyHistory.length === 0 ? <p className={e.empty}>No policy changes have been indexed.</p> : <DataTable label="Policy change evidence"><thead><tr><th scope="col">Version</th><th scope="col">Actor</th><th scope="col">Approval / observation</th><th scope="col">Evidence</th></tr></thead><tbody>{[...snapshot.policyHistory].reverse().map((change, index) => <tr key={`${change.transactionHash}-${index}`}><th scope="row">{change.version}</th><td><Explorer value={change.actor}/></td><td><span title={change.approvalDigest}>{/^0x0+$/.test(change.approvalDigest) ? 'No separate signature' : short(change.approvalDigest)}</span><code className={e.subline} title={change.observationHash}>{/^0x0+$/.test(change.observationHash) ? 'No observation reference' : short(change.observationHash)}</code></td><td><Explorer value={change.transactionHash} kind="tx">Policy transaction</Explorer></td></tr>)}</tbody></DataTable>}</section>
    <section className={e.section}><h2>Contracts &amp; authority</h2><p>Arc testnet · chain {deployment.chainId}. Open any address to inspect its on-chain history.</p><dl className={e.addresses}>{addresses.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Explorer value={value}/></dd></div>)}</dl></section>
  </>;
}

function Settlements({snapshot}: {snapshot: Snapshot}) {
  return <>
    <div className={e.sectionHeading}><h2>Settlements</h2><p>All indexed contract payments through block {snapshot.blockNumber}. Legacy direct transfers are available in <Link href="/app/evidence">Evidence</Link>.</p></div>
    <p className={e.note}>Payment confirms that funds moved. Delivery is the seller’s claim; acknowledgment is the buyer’s confirmation. Neither is an independent quality score.</p>
    {snapshot.orders.length === 0 ? <p className={e.empty}>No contract settlements have been indexed yet.</p> : <DataTable label="Contract settlements"><thead><tr><th scope="col">Order / agent</th><th scope="col">Seller</th><th scope="col">Paid / seller share</th><th scope="col">Delivery evidence</th><th scope="col">Receipt</th></tr></thead><tbody>{[...snapshot.orders].reverse().map(order => <tr key={order.orderId}><th scope="row"><code title={order.orderId}>{short(order.orderId)}</code><code className={e.subline} title={order.agentId}>{short(order.agentId)}</code></th><td><Explorer value={order.seller}/></td><td className={e.value}>{money(order.principalAtomic)}<span className={e.subline}>Seller: {money(order.sellerAtomic)}</span></td><td>{order.buyerAcknowledged ? 'Buyer acknowledged' : order.delivered ? 'Seller attested' : 'Awaiting delivery'}</td><td><Explorer value={order.transactionHash} kind="tx">Allocation</Explorer></td></tr>)}</tbody></DataTable>}
    <section className={e.section}><h2>Seller evidence</h2><p>Cumulative counts from the ledger. Buyer acknowledgment rates can include related parties or collusion; output quality remains unverified.</p>{snapshot.reputation.length === 0 ? <p className={e.empty}>Seller evidence appears after services are indexed.</p> : <DataTable label="Seller delivery and acknowledgment counts"><thead><tr><th scope="col">Seller</th><th scope="col">Paid</th><th scope="col">Delivered</th><th scope="col">Acknowledged</th><th scope="col">Acknowledgment rate</th><th scope="col">Quality</th></tr></thead><tbody>{snapshot.reputation.map(seller => <tr key={seller.seller}><th scope="row"><Explorer value={seller.seller}/></th><td>{seller.paid}</td><td>{seller.delivered}</td><td>{seller.acknowledged}</td><td>{percent(seller.acceptanceBps)}</td><td className={e.unavailable}>Unverified</td></tr>)}</tbody></DataTable>}</section>
    <EconomyOrderDelivery deployment={snapshot.deployment}/>
  </>;
}

export function EconomyWorkspace() {
  const section = useWorkspaceSection(['prices', 'rules', 'settlements'], 'prices');
  const [result, setResult] = useState<EconomyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void api<EconomyResponse>('/api/economy', {signal: controller.signal, method:attempt?'POST':'GET'}).then(value => {
      if (!controller.signal.aborted) setResult(value);
    }).catch(caught => {if (!controller.signal.aborted) setError(errorMessage(caught));})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [attempt]);

  useEffect(()=>{const controller=new AbortController();const timer=window.setInterval(()=>{void api<EconomyResponse>('/api/economy',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setResult(value);setError('');}}).catch(caught=>{if(!controller.signal.aborted)setError(errorMessage(caught));});},60000);return()=>{window.clearInterval(timer);controller.abort();};},[]);

  const snapshot = result?.snapshot;
  return <main id="main" className={`${s.main} ${e.page}`}>
    <header className={e.heading}><div><h1>Economy</h1><p>Resource prices, spending rules and the evidence behind agent payments.</p></div><button className={s.secondary} onClick={() => setAttempt(value => value + 1)} disabled={loading}><RefreshCw size={15} aria-hidden="true"/>{loading ? 'Refreshing…' : 'Refresh data'}</button></header>
    <WorkspaceSections current={section} label="Economy sections" items={[{id: 'prices', label: 'Prices & activity'}, {id: 'rules', label: 'Spending rules'}, {id: 'settlements', label: 'Settlements'}]}/>
    {error && <div className={e.error} role="alert"><h2>Economy data could not be refreshed</h2><p>{error}</p>{snapshot && <p>The last loaded snapshot remains below. Use Refresh data to try again.</p>}</div>}
    {loading && !result ? <p className={e.empty} role="status">Loading finalized economy evidence…</p> : !snapshot && result ? <section className={e.startState}><h2>{result.status === 'not_deployed' ? 'The economy contracts are not deployed yet' : 'Waiting for the first indexed snapshot'}</h2><p>{result.status === 'not_deployed' ? 'On-chain prices, spending rules and allocations will appear after the Arc testnet deployment is configured and indexed.' : 'The deployment is configured. Its finalized transactions must be indexed before this workspace can show measurements.'}</p><p>Missing evidence is unavailable; it is not zero economic activity.</p><Link className={s.secondary} href="/app/marketplace">Browse the marketplace</Link></section> : snapshot ? <>
      <div className={e.provenance}><span className={snapshot.caughtUp ? e.status : e.pending}>{snapshot.caughtUp ? 'Finalized snapshot' : 'Index catching up'}</span><span>Block <Explorer value={snapshot.blockNumber} kind="block">{snapshot.blockNumber}</Explorer></span><span>Chain time {date(snapshot.chainTimestamp)}</span><span>Loaded index {new Date(snapshot.indexedAt).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}</span></div>
      {!snapshot.caughtUp && <p className={e.note} role="status">The index has not reached the latest finalized block. These measurements cover the indexed history only.</p>}
      <section id="prices" hidden={section !== 'prices'}>{section === 'prices' && <Prices snapshot={snapshot}/>}</section>
      <section id="rules" hidden={section !== 'rules'}>{section === 'rules' && <Rules snapshot={snapshot}/>}</section>
      <section id="settlements" hidden={section !== 'settlements'}>{section === 'settlements' && <Settlements snapshot={snapshot}/>}</section>
    </> : null}
    <footer className={e.resources}><p>Testnet USDC and HBAR only. No Obolos token.</p><div><a href="/api/economy" target="_blank" rel="noopener noreferrer">Public economy JSON <ArrowUpRight size={13} aria-hidden="true"/></a><Link href="/app/developers#integration">Developer integration</Link></div></footer>
  </main>;
}
