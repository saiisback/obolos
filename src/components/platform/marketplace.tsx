'use client';

import Link from 'next/link';
import {ResourceMarketplace, ResourcePurchases} from './resource-marketplace';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {MarketPriceHistory} from './market-price-history';
import {priceChangeLabel} from '@/lib/market/price-state';
import {WorkspaceSections, useWorkspaceSection} from './workspace-sections';
import type { MarketOrder, MarketService } from '@/lib/market/contracts';
import { api, errorMessage, type User, type Agent } from './api';
import { ArrowDown, ArrowUpRight, ChevronDown, RefreshCw, Search, Store } from 'lucide-react';
import s from './platform.module.css';
import m from './marketplace.module.css';

export function parseMarketPrice(value: string): number {
  if (!/^(?:0|1)(?:\.\d{1,6})?$/.test(value)) throw new Error('Enter 0.001–1 USDC with at most 6 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const atomic = Number(BigInt(whole + fraction.padEnd(6, '0')));
  if (atomic < 1_000 || atomic > 1_000_000) throw new Error('The price must be between 0.001 and 1 test USDC.');
  return atomic;
}

export function formatMarketPrice(value: number | string): string {
  const atomic = BigInt(value);
  const padded = atomic.toString().padStart(7, '0');
  const fraction = padded.slice(-6).replace(/0+$/, '');
  return `${padded.slice(0, -6)}${fraction ? `.${fraction}` : ''}`;
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function Marketplace({workspace = false}: {workspace?: boolean}) {
  const section = useWorkspaceSection(['catalog', 'purchases', 'seller-heading'], 'catalog');
  const [publishing, setPublishing] = useState(false);
  const [executionType, setExecutionType] = useState('hosted-metric-verifier');
  const [services, setServices] = useState<MarketService[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [mine, setMine] = useState<MarketService[]>([]);
  const [purchases, setPurchases] = useState<(MarketOrder & {agentName:string;serviceName:string})[]>([]);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [totalAtomic, setTotalAtomic] = useState('0');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError(''); setRefreshing(true);
    try {
      const [catalog, account] = await Promise.all([
        api<{ services: MarketService[] }>('/api/market/services'),
        api<{ user: User | null }>('/api/account'),
      ]);
      setServices(catalog.services); setUpdatedAt(new Date());
      setUser(account.user);
      if (account.user) {
        const [owned, earnings, ownedAgents, bought] = await Promise.all([
          api<{ services: MarketService[] }>('/api/market/services?mine=1'),
          api<{ orders: MarketOrder[]; totalAtomic: string }>('/api/market/earnings'),
          api<{agents:Agent[]}>('/api/agents'),
          api<{orders:(MarketOrder & {agentName:string;serviceName:string})[]}>('/api/market/purchases'),
        ]);
        setPurchases(bought.orders); setAgents(ownedAgents.agents); setMine(owned.services); setOrders(earnings.orders); setTotalAtomic(earnings.totalAtomic);
      } else { setMine([]); setOrders([]); setPurchases([]); setAgents([]); setTotalAtomic('0'); }
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function recoverDelivery(id:string) {
    setBusy(id); setError(''); setNotice('');
    try { await api(`/api/market/orders/${id}/delivery`,{method:'POST',body:'{}'}); await load(); setNotice('The existing paid order was delivered. No new payment was submitted.'); }
    catch(caught) {await load();setError(errorMessage(caught));}
    finally {setBusy('');}
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy('publish'); setError(''); setNotice('');
    try {
      await api('/api/market/services', { method: 'POST', body: JSON.stringify({ name: String(data.get('name')).trim(), description: String(data.get('description')).trim(), priceAtomic: parseMarketPrice(String(data.get('price'))), ...(data.get('agentId') ? {agentId:String(data.get('agentId'))} : {}), ...(executionType === 'external-repo-verifier' ? {execution:executionType,providerEndpoint:String(data.get('providerEndpoint')).trim()} : {}) }) });
      form.reset(); setPublishing(false); setNotice('Service published. Buyers can now select these exact terms for a spending mandate.'); await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(''); }
  }

  async function update(event: FormEvent<HTMLFormElement>, service: MarketService) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(service.id); setError(''); setNotice('');
    try {
      await api(`/api/market/services/${service.id}`, { method: 'PATCH', body: JSON.stringify({ name: String(data.get('name')).trim(), description: String(data.get('description')).trim(), priceAtomic: parseMarketPrice(String(data.get('price'))), active: data.get('active') === 'true', ...(service.execution === 'external-repo-verifier' ? {providerEndpoint:String(data.get('providerEndpoint')).trim()} : {}) }) });
      setNotice('Listing updated. Its revision changed, so buyers must review and sign the current terms.'); await load();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(''); }
  }

  const visibleServices = services.filter(service => `${service.name} ${service.description}`.toLowerCase().includes(query.toLowerCase().trim()));

  return <main id="main" className={`${s.main} ${m.market} ${workspace ? m.embedded : ""}`}>
    {workspace ? <header className={m.workspaceHeading}><h1>Marketplace</h1><p>Browse resource services and repository verifiers, inspect purchases, or manage your verifier listings.</p></header> : <>
    <header className={m.hero}>
      <h1>Give your agent<br />a marketplace.</h1>
      <div><p>Find data, compute, inference, verification, and storage services for your agents. Inspect exact terms and real settlement receipts.</p><div className={m.actions}><a href="#resource-catalog-heading" className={s.primary}>Explore services <ArrowDown size={16} /></a><a href="#seller-heading" className={s.textLink}>Seller desk <ArrowUpRight size={16} /></a></div></div>
    </header>
    <div className={m.context}><span>Arc testnet · Direct USDC settlement</span><a href="/evidence">Inspect a paid run <ArrowUpRight size={14} /></a></div>
    </>}
    {workspace && <WorkspaceSections current={section} label="Marketplace sections" items={[{id:'catalog',label:'Browse services'},{id:'purchases',label:'Your purchases'},{id:'seller-heading',label:'Your seller desk'}]}/>}
    {error && <div className={s.error} role="alert"><p>{error}</p><button className={s.secondary} onClick={load}>Try again</button></div>}
    {notice && <p className={s.notice} role="status">{notice}</p>}
    <section id="catalog" hidden={workspace && section !== 'catalog'} aria-labelledby="catalog-heading" aria-busy={refreshing}>
      <ResourceMarketplace /><div className={m.catalogHeading}><div><h2 id="catalog-heading">Repository verifiers <span className={s.count}>{loading ? '—' : services.length}</span></h2><p role="status">{loading ? 'Fetching published services…' : refreshing ? 'Refreshing live terms…' : updatedAt ? `Live terms · Updated ${updatedAt.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}` : 'Live terms returned by the marketplace API.'}</p></div><div className={m.catalogTools}><label className={m.search}><Search size={16} aria-hidden="true" /><input aria-label="Search verifiers" placeholder="Find a verifier" value={query} onChange={event => setQuery(event.target.value)} /></label><button className={s.secondary} onClick={load} disabled={refreshing || !!busy} aria-label="Refresh listings"><RefreshCw size={16} /><span>Refresh</span></button></div></div>
      {loading ? <div className={m.loading} role="status"><span /><span /><span /><p>Loading published services…</p></div> : services.length === 0 ? <div className={s.empty}><Store size={30} aria-hidden="true" /><h3>{error ? 'Listings could not be loaded.' : 'No active repository verifiers yet.'}</h3><p>{error ? 'Use Try again above to fetch the catalog.' : 'A signed-in seller can publish the first hosted verifier below. Buyers cannot prepare a new mandate until a real listing exists.'}</p></div> : visibleServices.length === 0 ? <div className={s.empty}><h3>No matching verifiers.</h3><p>Try a service name or a different keyword.</p><button className={s.secondary} onClick={() => setQuery('')}>Clear search</button></div> : <div className={m.grid}>{visibleServices.map(service => <ServiceCard service={service} key={service.id} />)}</div>}
    </section>
    <details hidden={workspace && section !== 'catalog'} className={m.funding}><summary>Repository-verifier funding and execution <ChevronDown size={18} /></summary><p>Choose hosted metric checks or connect your own agent endpoint. External providers receive the report and purchased evidence after payment confirmation. A confirmed payment proves settlement; it does not certify the provider’s output.</p><div className={m.roles}><div><strong>Owner sets scope and signs</strong><p>A mandate is an allowance. It does not fund the runner.</p></div><div><strong>Runner executes and settles</strong><p>Your private runner and broker must be online and separately funded.</p></div><div><strong>Seller receives test USDC</strong><p>Confirmed payments go directly to the listing wallet. Delivery can remain pending after payment.</p></div></div><a href={workspace ? "/app/developers#runner" : "/developers#runner"}>Read the runner setup guide <ArrowUpRight size={14} /></a></details>
    {workspace && <section id="purchases" hidden={section !== 'purchases'} className={m.purchases}><div className={m.catalogHeading}><div><h2>Your purchases</h2><p>Resource orders and repository-verifier orders use separate execution flows.</p></div><button className={s.secondary} onClick={load} disabled={refreshing || !!busy}>Refresh verifier orders</button></div><ResourcePurchases /><h3>Repository-verifier purchases</h3>{!purchases.length ? <div className={s.empty}><h3>No repository-verifier orders yet</h3><p>Choose a service, sign its terms in your agent workspace, and queue a run. Your paid orders appear here.</p><a href="#catalog" className={s.secondary}>Browse services</a></div> : purchases.map(order=><article className={m.purchaseRow} key={order.id}><div><h3>{order.serviceName}</h3><p>{order.agentName} · {new Date(order.createdAt).toLocaleString()}</p><code>{order.id}</code>{order.deliveryError && <p role="status">{order.deliveryError}</p>}</div><div><strong>{formatMarketPrice(order.amountAtomic)} USDC</strong><span className={s.tag}>{order.status === 'paid' ? 'Paid · delivery pending' : order.status === 'fulfilled' ? 'Paid & delivered' : 'Quoted · not confirmed'}</span></div><div className={m.orderActions}>{order.transactionHash && <a href={`https://testnet.arcscan.app/tx/${order.transactionHash}`} target="_blank" rel="noreferrer">Payment receipt</a>}{order.status === 'paid' && <button className={s.secondary} onClick={()=>void recoverDelivery(order.id)} disabled={!!busy}>{busy === order.id ? 'Recovering delivery…' : 'Retry delivery only'}</button>}{order.result && <details><summary>Delivered checks</summary>{order.result.checks.map((check,i)=><p key={i}><strong>{check.passed ? 'Passed' : 'Failed'} · {check.label}</strong><br/>{check.detail}</p>)}</details>}</div></article>)}</section>}
    <section hidden={workspace && section !== 'seller-heading'} className={m.sellerSection} aria-labelledby="seller-heading"><div className={s.sectionHeading}><div><h2 id="seller-heading">Repository-verifier seller desk</h2><p>Your authenticated EVM wallet is the immutable payout recipient.</p></div>{loading ? <span className={s.tag}>Checking session…</span> : user ? <span className={s.tag} title={user.address}>{shortAddress(user.address)}</span> : <Link href="/login" className={s.primary}>Sign in to sell</Link>}</div>
      {loading ? <p className={s.caption}>Loading your seller workspace…</p> : !user ? <div className={m.signin}><strong>Wallet sign-in required</strong><p>Browsing is public. Publishing, editing paused listings, and viewing earnings are scoped to the signed-in seller wallet.</p></div> : <>
        {workspace && <div className={m.publishAction}><p>Manage listing terms and inspect payments received by your wallet.</p><button className={s.primary} onClick={() => setPublishing(value => !value)} disabled={!!busy}>{publishing ? 'Cancel new listing' : 'Publish a service'}</button></div>}
        <form hidden={workspace && !publishing} className={s.marketForm} onSubmit={publish}><h3>{executionType === 'external-repo-verifier' ? 'New agent endpoint listing' : 'New hosted verifier listing'}</h3><div className={s.formGrid}><label className={s.fullWidth}>Who performs the work?<select aria-label="Service execution" value={executionType} onChange={event=>setExecutionType(event.target.value)} disabled={!!busy}><option value="hosted-metric-verifier">Obolos-hosted metric checks</option><option value="external-repo-verifier">My agent / API endpoint</option></select></label>{executionType === 'external-repo-verifier' && <label className={s.fullWidth}>Public HTTPS endpoint<input name="providerEndpoint" type="url" required placeholder="https://your-agent.example/verify" disabled={!!busy}/><small>Your API receives a paid order and report using the Obolos verifier contract. Use a public HTTPS URL without credentials, query parameters, or redirects. <Link href="/app/developers#selling">Endpoint setup guide</Link></small></label>}<label className={s.fullWidth}>Publishing identity<select name="agentId" disabled={!!busy} defaultValue=""><option value="">My wallet</option>{agents.map(agent=><option value={agent.id} key={agent.id}>{agent.name}</option>)}</select><small>Attribute this listing to an agent you own. Your signed-in wallet receives payments. The publishing identity cannot be changed after creation.</small></label><label>Name<input name="name" maxLength={80} required placeholder="Repository metric check" disabled={!!busy} /></label><label>Price · test USDC<input name="price" inputMode="decimal" defaultValue="0.06" required disabled={!!busy} /><small>0.001–1 USDC · paid on Arc testnet</small></label><label className={s.fullWidth}>Description<textarea name="description" maxLength={1000} rows={3} required placeholder="Describe the repository checks buyers receive." disabled={!!busy} /></label></div><div className={s.formFooter}><p>Publishing does not move funds. Your connected wallet becomes the payout address.</p><button className={s.primary} disabled={!!busy}>{busy === 'publish' ? 'Publishing…' : 'Publish service'}</button></div></form>
        <div className={s.sellerColumns}><section><h3>Your listings <span className={s.count}>{mine.length}</span></h3>{mine.length === 0 ? <p className={s.jobsEmpty}>You have not published a service with this wallet.</p> : mine.map(service => <OwnedService key={service.id} service={service} busy={busy === service.id} onSubmit={event => update(event, service)} />)}</section><section className={s.earnings}><div><span>Confirmed earnings</span><strong>{formatMarketPrice(totalAtomic)} <small>test USDC</small></strong><p>Arc testnet · payments go directly to your wallet, not a custodial balance</p></div><h3>Settled orders</h3>{orders.length === 0 ? <p className={s.jobsEmpty}>No confirmed orders for your listings yet.</p> : orders.map(order => <div className={s.earningRow} key={order.id}><div><strong>{formatMarketPrice(order.amountAtomic)} USDC</strong><p>{order.id}</p></div>{order.transactionHash && <a className={s.textLink} href={`https://testnet.arcscan.app/tx/${order.transactionHash}`} target="_blank" rel="noreferrer">Payment receipt</a>}<span className={s.tag}>{order.status === 'paid' ? 'Paid · delivery pending' : order.chainConfirmed ? 'Paid & delivered' : order.status}</span></div>)}</section></div>
      </>}
    </section>
  </main>;
}

function ServiceCard({ service }: { service: MarketService }) {
  return <article className={m.card}>
    <div className={m.serviceInfo}><div className={m.serviceType}><Store size={16} aria-hidden="true" /><span>{service.execution === 'external-repo-verifier' ? 'Agent endpoint' : 'Hosted metric verifier'}</span><span>Revision {service.revision}</span></div><h3>{service.name}</h3><p>{service.description}</p><dl><div><dt>Recipient</dt><dd><a href={`https://testnet.arcscan.app/address/${service.recipient}`} title={service.recipient}>{shortAddress(service.recipient)} <ArrowUpRight size={12} /></a></dd></div><div><dt>Execution</dt><dd>{service.execution === 'external-repo-verifier' ? 'Seller-operated API' : 'Obolos hosted'}</dd></div>{service.agentName && <div><dt>Seller agent</dt><dd>{service.agentName}</dd></div>}</dl>{service.execution === 'external-repo-verifier' && <p className={m.endpointLabel}><span>Provider endpoint</span><code>{service.providerEndpoint}</code></p>}<MarketPriceHistory key={`${service.id}-${service.revision}`} serviceId={service.id}/></div>
    <div className={m.purchase}><div className={m.price}><strong>{formatMarketPrice(service.priceAtomic)}</strong><span>test USDC</span></div><p>Per verification · Arc testnet</p><Link href={`/app?service=${service.id}`} className={s.primary}>Choose for an agent <ArrowUpRight size={16} /></Link><small>Review terms before signing</small></div>
  </article>;
}

function OwnedService({ service, busy, onSubmit }: { service: MarketService; busy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [price, setPrice] = useState(formatMarketPrice(service.priceAtomic));
  let priceNotice = ''; try {priceNotice = priceChangeLabel(service.priceAtomic,parseMarketPrice(price));} catch { /* Form validation reports invalid amounts on save. */ }
  return <details className={s.ownedService}><summary><span><strong>{service.name}</strong><small>{service.agentName ? `${service.agentName} · ` : 'Wallet listing · '}Revision {service.revision} · {service.active ? 'Active' : 'Paused'}</small></span><span>{formatMarketPrice(service.priceAtomic)} USDC</span></summary><form onSubmit={onSubmit}><label>Name<input name="name" defaultValue={service.name} maxLength={80} required disabled={busy} /></label><label>Description<textarea name="description" defaultValue={service.description} maxLength={1000} rows={2} required disabled={busy} /></label><label>Price · test USDC<input name="price" value={price} onChange={event=>setPrice(event.target.value)} inputMode="decimal" required disabled={busy} /></label>{service.execution === 'external-repo-verifier' && <label className={s.fullWidth}>Provider endpoint<input name="providerEndpoint" type="url" required defaultValue={service.providerEndpoint} disabled={busy}/></label>}<label>Status<select name="active" defaultValue={String(service.active)} disabled={busy}><option value="true">Active</option><option value="false">Paused</option></select></label><p className={s.caption}>{priceNotice}. Saving creates a new revision and requires buyers to sign current terms before further purchases.<br/>Recipient <code>{service.recipient}</code></p><button className={s.secondary} disabled={busy}>{busy ? 'Saving…' : 'Save as new revision'}</button></form><MarketPriceHistory key={`${service.id}-${service.revision}`} serviceId={service.id}/></details>;
}
