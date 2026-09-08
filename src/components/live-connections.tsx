'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUpRight, Check, CircleDollarSign, Clipboard, ExternalLink,
  Fingerprint, FlaskConical, Globe2, Loader2, LockKeyhole,
  RefreshCw, ShieldCheck, TriangleAlert, Wallet,
} from 'lucide-react';
import type { ApiResult } from '@/lib/contracts';
import type { LiveOverview, WalletSnapshot } from '@/lib/live-contracts';
import './live-connections.css';

function exactBalance(atomic: string | null, decimals: number): string | null {
  if (atomic === null || !/^\d+$/.test(atomic) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
  const digits = atomic.replace(/^0+(?=\d)/, '').padStart(decimals + 1, '0');
  const whole = (decimals ? digits.slice(0, -decimals) : digits).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = decimals ? digits.slice(-decimals).replace(/0+$/, '') : '';
  return fraction ? `${whole}.${fraction}` : whole;
}

function timestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Timestamp unavailable' : parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function PublicAddress({ label, value, onCopy }: { label: string; value: string | null; onCopy: (value: string) => void }) {
  return <div className="live-address">
    <dt>{label}</dt>
    <dd><code>{value ?? 'Not configured'}</code>{value && <button type="button" className="live-copy" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => onCopy(value)}><Clipboard size={15} /></button>}</dd>
  </div>;
}

function WalletCard({ wallet, checkedAt, onCopy }: { wallet: WalletSnapshot; checkedAt: string; onCopy: (value: string) => void }) {
  const balance = wallet.balanceStatus === 'available' ? exactBalance(wallet.balanceAtomic, wallet.decimals) : null;
  const source = wallet.balanceSource === 'hedera-mirror' ? 'Hedera Mirror Node' : wallet.balanceSource === 'arc-rpc' ? 'Arc JSON-RPC' : 'No balance source available';
  return <article className="live-wallet">
    <div className="live-wallet-top"><span className="live-network-icon">{wallet.asset === 'HBAR' ? 'ℏ' : <CircleDollarSign size={23} strokeWidth={1.6} />}</span><div><h3>{wallet.name}</h3><p>{wallet.network}</p></div><span className="live-testnet">Testnet</span></div>
    <div className="live-wallet-balance"><span>Wallet balance</span><strong>{balance ?? 'Unavailable'}{balance !== null && <small>{wallet.asset}</small>}</strong><p>{wallet.balanceStatus === 'unconfigured' ? 'Configure this wallet in the capability broker.' : wallet.detail}</p></div>
    <dl className="live-wallet-addresses"><PublicAddress label="Public address" value={wallet.address} onCopy={onCopy} /><PublicAddress label="Service recipient" value={wallet.payTo} onCopy={onCopy} /></dl>
    <div className="live-wallet-source"><span>{source}</span><time dateTime={checkedAt}>Checked {timestamp(checkedAt)}</time></div>
    {wallet.explorerUrl && <a className="live-explorer" href={wallet.explorerUrl} target="_blank" rel="noreferrer">View wallet on explorer<ArrowUpRight size={16} /></a>}
    <p className="live-wallet-note">{wallet.id === 'circle-agent' ? 'Managed by Circle Agent Wallet infrastructure. This is separate from the Ledger controller and the broker’s Ring-protected secrets.' : 'Configured and signed through the capability broker. This public address is read-only in the dashboard.'}</p>
  </article>;
}

export default function LiveConnections({ operatorAuthenticated }: { operatorAuthenticated: boolean }) {
  const [overview, setOverview] = useState<LiveOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    async function load() {
      try {
        const response = await fetch('/api/live', { cache: 'no-store', signal: controller.signal });
        const result = await response.json() as ApiResult<LiveOverview>;
        if ('error' in result) throw new Error(result.error);
        if (!response.ok) throw new Error('Live setup could not be loaded.');
        if (!controller.signal.aborted) setOverview(result.data);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Live setup could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [operatorAuthenticated, revision]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice('Public address copied.'); }
    catch { setNotice('Clipboard unavailable. Select and copy the public address directly.'); }
  }
  const canViewWallets = operatorAuthenticated && overview?.operatorAuthenticated;
  const remainingChecks = overview?.checks.filter(check => check.status !== 'ready').length ?? 0;
  const evidence = overview ? [
    { label: 'Live runs', count: overview.evidence.liveRuns },
    { label: 'Hedera payments', count: overview.evidence.hederaPayments },
    { label: 'Arc payments', count: overview.evidence.arcPayments },
    { label: 'Controller proofs', count: overview.evidence.ledgerApprovals },
  ] : [];

  return <section className="live-connections" aria-labelledby="live-readiness-title" aria-busy={loading}>
    <div className="live-section-heading"><div><p className="live-overline">Live workspace</p><h2 id="live-readiness-title">From rehearsal to real evidence.</h2><p>Two testnet wallets. A human-defined mandate. A record of what actually happened.</p></div><button type="button" className="button live-refresh" disabled={loading} onClick={() => setRevision(value => value + 1)}>{loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}Refresh setup</button></div>
    {error && <div className="live-error" role="alert"><TriangleAlert size={19} /><div><strong>Could not refresh live setup</strong><p>{error}</p>{overview && <p>The information below is from the previous successful check.</p>}</div></div>}
    {notice && <p className="live-notice" role="status"><Check size={16} />{notice}</p>}
    {loading && !overview && <div className="live-loading" role="status"><Loader2 size={24} className="spin" /><p>Checking integrations and wallet visibility…</p></div>}
    {overview && <>
      <div className="live-readiness-banner"><span className="live-readiness-icon"><ShieldCheck size={26} strokeWidth={1.5} /></span><div><h3>{overview.liveEnabled ? 'Live execution is configured.' : 'A few things before going live.'}</h3><p>{remainingChecks ? `${remainingChecks} setup ${remainingChecks === 1 ? 'item needs' : 'items need'} attention.` : 'All reported setup checks are ready.'} Configuration is not proof of a completed payment or track qualification.</p></div><span className="live-checked"><FlaskConical size={14} />Testnets only</span></div>
      <div className="live-subheading"><h3>Your execution wallets</h3><span>Balances are separate from run allowances.</span></div>
      {!canViewWallets ? <div className="live-locked"><LockKeyhole size={25} strokeWidth={1.5} /><div><h3>Wallet details are for the operator.</h3><p>Authenticate this browser to read public addresses, recipients and live testnet balances. Wallet credentials stay in the broker.</p></div><a className="button primary" href="#operator-token">Authenticate operator<ArrowUpRight size={15} /></a></div> : overview.wallets.length ? <div className="live-wallet-grid">{overview.wallets.map(wallet => <WalletCard key={wallet.id} wallet={wallet} checkedAt={overview.checkedAt} onCopy={value => void copy(value)} />)}</div> : <div className="live-no-wallets"><Wallet size={24} strokeWidth={1.5} /><h3>No wallet snapshots available.</h3><p>Configure the capability broker, then refresh. An unavailable balance is not a zero balance.</p></div>}
      {canViewWallets && <div className="live-controller"><div><Fingerprint size={20} /><strong>{overview.signerMode === 'speculos' ? 'Speculos mandate controller' : 'Ledger mandate controller'}</strong></div><dl><PublicAddress label="Controller address" value={overview.controllerAddress} onCopy={value => void copy(value)} /></dl><p>{overview.signerMode === 'speculos' ? 'Development mode: spending-limit approvals use a Speculos emulator. They do not establish physical-device security or Ledger prize eligibility.' : 'The controller signs spending-limit escalations on the physical Ledger. Its address is distinct from the payment wallets.'}</p></div>}
      <div className="live-subheading"><h3>Setup checklist</h3><time dateTime={overview.checkedAt}>Checked {timestamp(overview.checkedAt)}</time></div>
      <ul className="live-checks">{overview.checks.map(check => <li key={check.id}><span className={`live-check-icon live-check-${check.status}`}>{check.status === 'ready' ? <Check size={17} /> : <TriangleAlert size={17} />}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div><span className={`live-check-status live-check-${check.status}`}>{check.status === 'ready' ? 'Ready' : check.status === 'action' ? 'Action required' : 'Missing'}</span></li>)}</ul>
      {!overview.checks.length && <p className="live-muted">No setup checks were returned by the server.</p>}
      <div className="live-subheading"><h3>Recorded live evidence</h3><span>This browser’s run history</span></div>
      <div className="live-evidence">{evidence.map(item => <div key={item.label}><strong>{item.count.toLocaleString()}</strong><span>{item.label}</span></div>)}</div>
      <p className="live-evidence-note">Payment counts represent recorded live settlement evidence. Rehearsal payments and simulated approvals do not count. These totals do not establish sponsor eligibility.</p>
      <div className="live-boundaries"><div><Globe2 size={23} strokeWidth={1.5} /><h3>What happens on-chain</h3><p>Hedera testnet settles HBAR payments for repository evidence. Arc testnet settles USDC payments for report verification. The networks have separate wallets and allowances; this app does not bridge funds.</p></div><div><LockKeyhole size={23} strokeWidth={1.5} /><h3>What stays off-chain</h3><p>The model, orchestration, broker and payment facilitator run off-chain. Circle’s agent wallet uses its own MPC custody infrastructure. Ledger Ring protects stored broker secrets, which the trusted broker decrypts in memory. The Ledger controller signs mandate changes.</p></div></div>
      <div className="live-subheading"><h3>Setup resources</h3><span>Official documentation and testnet funding</span></div>
      {overview.resources.length ? <div className="live-resources">{overview.resources.map(resource => <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer"><span>{resource.label}</span><ArrowUpRight size={17} /></a>)}</div> : <p className="live-muted">No resource links were returned by the server.</p>}
      {overview.serviceUrl && <a className="live-service-link" href={`${overview.serviceUrl}/discovery`} target="_blank" rel="noreferrer"><ExternalLink size={15} />Open evidence service discovery<ArrowUpRight size={14} /></a>}
      <p className="live-management-note">Wallet management is read-only here. Provisioning, testnet funding and credential changes happen through the official tools and your capability broker. No recovery phrase, private key or Ledger PIN belongs in this interface.</p>
    </>}
  </section>;
}
