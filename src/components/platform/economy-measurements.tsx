'use client';
import {useState} from 'react';
import {formatUnits,keccak256,toHex} from 'viem';
import type {EconomyMeasurements} from '@/lib/economy/measurements';
import e from './economy-workspace.module.css';
type Json<T>=T extends bigint?string:T extends (infer U)[]?Json<U>[]:T extends object?{[K in keyof T]:Json<T[K]>}:T;
const fmt=(n:string|null,places=6,suffix=' USDC')=>n===null?'Awaiting measurement':formatUnits(BigInt(n),places)+suffix;
const date=(n:number)=>new Date(n*1000).toISOString().replace('T',' ').replace('.000Z',' UTC');
const short=(s:string)=>s.slice(0,8)+'…'+s.slice(-6);
const unitNames=Object.fromEntries(['source-record','compute-unit','inference-request','verification-job','stored-object-hour','gigabyte-hour'].map(s=>[keccak256(toHex(s)),s.replaceAll('-',' ')]));
const tx=(hash:string)=>`https://testnet.arcscan.app/tx/${hash}`;
export function EconomyMeasurementsView({value:m}:{value:Json<EconomyMeasurements>}){
 const [period,setPeriod]=useState<'today'|'lifetime'>('today');const w=m[period],p=m.prices;
 const turnover=period==='today'?m.capital.todayTurnoverBps:m.capital.lifetimeTurnoverBps;
 const turnoverValue=turnover==='0'&&BigInt(w.grossPaymentsAtomic)>0n?'Below 0.0001×':fmt(turnover,4,'×');
 const rows=[
  ['Gross payments',fmt(w.grossPaymentsAtomic),`${w.settlementCount} finalized settlements in this period.`],
  ['Seller allocations',fmt(w.sellerRevenueAtomic),'Actual seller transfers before separately recorded refunds.'],
  ['Recorded refunds',fmt(w.refundAtomic),`${w.refundCount} verified refunds, grouped by their accounting record time.`],
  ['Seller deliveries',String(w.deliveredCount),'Delivery attestations that occurred in this period.'],
  ['Buyer acknowledgments',String(w.acknowledgedCount),'Buyer confirmations that occurred in this period.'],
  ['Active executor balances',fmt(m.capital.totalAtomic),`${m.capital.executorCount} distinct active executor wallets, measured at block ${m.blockNumber}. Shared wallets count once.`],
  ['Payment turnover',turnoverValue,'Period payments divided by the current executor USDC balance; a spending measure, not GAP velocity.'],
 ];
 return <>
 <div className={e.sectionHeading}><h2>Measured economy</h2><p>Real Arc testnet activity through {date(m.asOf)}. Amounts are test USDC.</p></div>
 <div className={e.periodPicker}><label>Activity period<select value={period} onChange={event=>setPeriod(event.target.value as 'today'|'lifetime')}><option value="today">Today (UTC)</option><option value="lifetime">Since deployment</option></select></label><p>{date(w.start)} to {date(w.endInclusive)}{period==='today'?' · Day in progress':''}</p></div>
 <div className={e.tableScroll} tabIndex={0} role="region" aria-label="Measured economy activity"><table className={e.table}><thead><tr><th>Measure</th><th>Value</th><th>Evidence</th></tr></thead><tbody>{rows.map(([name,value,detail])=><tr key={name}><th scope="row">{name}</th><td className={e.value}>{value}</td><td className={e.explanation}>{detail}</td></tr>)}</tbody></table></div>
 <section className={e.section}><h2>Resource prices</h2><p>A fixed basket of five resource categories, weighted 20% each. Comparable registered quotes keep the same seller, unit, quantity and endpoint. Registrations document prices; they do not guarantee a seller is currently online.</p>
 <div className={e.tableScroll} tabIndex={0} role="region" aria-label="Measured resource prices"><table className={e.table}><thead><tr><th>Measure</th><th>Value</th><th>Period and source</th></tr></thead><tbody>
 <tr><th scope="row">Resource price index (ARPI)</th><td className={e.value}>{fmt(p.indexBps,2,'')}</td><td className={e.explanation}>{p.baselineAt===null?`Missing categories: ${p.missingCategories.join(', ')}`:`Baseline 100 established ${date(p.baselineAt)}.`}</td></tr>
 <tr><th scope="row">Change from baseline</th><td className={e.value}>{fmt(p.baselineChangeBps,2,'%')}</td><td className={e.explanation}>Current basket relative to its actual recorded baseline.</td></tr>
 <tr><th scope="row">Period inflation</th><td className={e.value}>{p.periodInflationBps===null?'Collecting daily history':fmt(p.periodInflationBps,2,'%')}</td><td className={e.explanation}>{p.priorClosedDay&&p.precedingClosedDay?`${date(p.precedingClosedDay.start)} to ${date(p.priorClosedDay.end)} · two closed days`:'Requires two full closed UTC days after the basket baseline. No past prices are invented.'}</td></tr>
 <tr><th scope="row">Change since previous close</th><td className={e.value}>{p.changeSincePriorCloseBps===null?'Awaiting first daily close':fmt(p.changeSincePriorCloseBps,2,'%')}</td><td className={e.explanation}>Current partial day versus the previous comparable closed day.</td></tr>
 </tbody></table></div>
 <div className={e.tableScroll} tabIndex={0} role="region" aria-label="Resource basket and purchasing power"><table className={e.table}><thead><tr><th>Resource</th><th>Baseline / current unit price</th><th>Purchasing power</th><th>Quote evidence</th></tr></thead><tbody>{p.purchasingPower.map(power=>{const c=p.components.find(c=>c.category===power.category)!;return <tr key={power.category}><th scope="row" className={e.capitalize}>{power.category}<span className={e.subline} title={power.unitHash}>{unitNames[power.unitHash]??short(power.unitHash)}</span></th><td>{fmt(c.baselineAtomic)} / {fmt(power.unitPriceAtomic)}</td><td>{fmt(power.unitsPerUsdcMillionths,6,' units / USDC')}<span className={e.subline}>{fmt(power.ordersPerUsdcMillionths,6,' orders / USDC')} · {power.quantity} units per order</span></td><td><a href={tx(power.transactionHash)} target="_blank" rel="noopener noreferrer">Current quote</a>{c.baselineTransactionHash&&<a className={e.subline} href={tx(c.baselineTransactionHash)} target="_blank" rel="noopener noreferrer">Baseline quote</a>}</td></tr>;})}</tbody></table></div>
 </section>
 <section className={e.section}><h2>Agent activity today</h2><p>{m.activity.fulfilledAgentCount} of {m.activity.activeAgentCount} currently active agents completed a seller-delivered, buyer-acknowledged order today: <strong>{fmt(m.activity.utilizationBps,2,'%')}</strong>. This is observed completion utilization; unnecessary or related-party work can still count, so it does not independently establish productivity.</p></section>
 <details className={e.details}><summary>Measurement scope and balance evidence</summary><ul>{m.limitations.map(text=><li key={text}>{text}</li>)}</ul><ul>{m.capital.balances.map(b=><li key={b.address}><a href={`https://testnet.arcscan.app/address/${b.address}`} target="_blank" rel="noopener noreferrer">{short(b.address)}</a>: {fmt(b.balanceAtomic)}</li>)}</ul><p>Input fingerprint: <code>{m.provenance.inputHash}</code></p></details>
 </>;
}
