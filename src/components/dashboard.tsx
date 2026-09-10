'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bot, Check, CheckCheck,
  ChevronDown, ChevronRight, Circle, CircleDollarSign, Clipboard, Clock3, Code2,
  FileCheck2, FileText, Fingerprint, FlaskConical, FolderGit2, Gauge, GitBranch,
  Globe2, LayoutDashboard, Loader2, LockKeyhole, Menu, MoreHorizontal, Pause,
  Play, Plus, ReceiptText, RefreshCw, Search, Settings2, ShieldCheck, Sparkles,
  TriangleAlert, Wallet, Waypoints, X, Zap,
} from 'lucide-react';
import LiveConnections from './live-connections';
import { approvalFile } from '@/lib/approval-export';
import type { ApiResult, DashboardState, Mandate, Mode, Receipt, Run, Stage } from '@/lib/contracts';

type View = 'overview' | 'runs' | 'receipts' | 'providers' | 'connections' | 'report';
const stages: { id: Stage; name: string; description: string; icon: typeof ShieldCheck }[] = [
  { id: 'mandate', name: 'Set the boundaries', description: 'Your budget. Your rules.', icon: ShieldCheck },
  { id: 'discovery', name: 'Find the right provider', description: 'Compare permitted quotes.', icon: Search },
  { id: 'purchase', name: 'Collect evidence', description: 'Pay per repository in HBAR.', icon: FolderGit2 },
  { id: 'report', name: 'Build the report', description: 'Turn evidence into an answer.', icon: FileText },
  { id: 'verification', name: 'Verify the work', description: 'Check the report with USDC.', icon: CheckCheck },
];
const statusLabels: Record<Run['status'], string> = { ready: 'Ready to run', running: 'In progress', awaiting_approval: 'Needs approval', paused: 'Paused', completed: 'Completed', failed: 'Failed' };
const defaultRepos = 'vercel/next.js\nremix-run/react-router\nsveltejs/kit';
const money = (atomic: number, asset: 'HBAR' | 'USDC') => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: asset === 'HBAR' ? 8 : 6 }).format(atomic / (asset === 'HBAR' ? 1e8 : 1e6))} ${asset}`;
const date = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const shortId = (id: string) => id.slice(0, 8);
const readable = (text: string) => text.replaceAll('_', ' ');
async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json() as ApiResult<T>;
  if ('error' in result) throw new Error(result.error);
  if (!response.ok) throw new Error('The request could not be completed. Please try again.');
  return result.data;
}
function saveText(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Status({ run }: { run: Run }) { return <span className={`status status-${run.status}`}><span className="status-dot" />{statusLabels[run.status]}</span>; }
function Empty({ icon: Icon = FileText, title, detail }: { icon?: typeof FileText; title: string; detail: string }) { return <div className="empty-state"><span className="empty-icon"><Icon size={24} strokeWidth={1.5} /></span><h3>{title}</h3><p>{detail}</p></div>; }

export default function Dashboard() {
  const [state, setState] = useState<DashboardState | null>(null);
  const [view, setView] = useState<View>('overview');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [configure, setConfigure] = useState(false);
  const [mode, setMode] = useState<Mode>('rehearsal');
  const [repos, setRepos] = useState(defaultRepos);
  const [dataBudget, setDataBudget] = useState('0.02');
  const [unitPrice, setUnitPrice] = useState('0.0015');
  const [verificationBudget, setVerificationBudget] = useState('0.10');
  const [providers, setProviders] = useState('repo-standard, repo-economy');
  const [expiry, setExpiry] = useState('60');
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [autoRunId, setAutoRunId] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [token, setToken] = useState('');
  const [signature, setSignature] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [runSearch, setRunSearch] = useState('');
  const requestInFlight = useRef(false);
  const navigationRef = useRef<HTMLElement>(null);
  const receiptRef = useRef<HTMLElement>(null);
  const run = state?.runs.find(item => item.id === selectedId) ?? null;
  const isSetup = configure || !run;
  const allReceipts = state?.runs.flatMap(item => item.receipts) ?? [];

  const refresh = useCallback(async () => {
    try {
      const next = await api<DashboardState>('/api/state'); setState(next);
      setSelectedId(current => current ?? next.runs[0]?.id ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load workspace.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); } }, [notice]);

  useEffect(() => {
    if (!mobileNav) return;
    const navigation = navigationRef.current;
    if (!navigation) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    navigation.querySelector<HTMLElement>('[aria-label="Close navigation"]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileNav(false); return; }
      if (event.key !== 'Tab') return;
      const controls = Array.from(navigation.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"]'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !navigation.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !navigation.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const desktop = window.matchMedia('(min-width: 1061px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileNav(false); };
    document.addEventListener('keydown', onKeyDown);
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      desktop.removeEventListener('change', closeOnDesktop);
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      else document.querySelector<HTMLElement>('.global-header .brand')?.focus();
    };
  }, [mobileNav]);

  useEffect(() => {
    if (!selectedReceipt || view !== 'receipts') return;
    const receipt = receiptRef.current;
    if (!receipt) return;
    const opener = document.querySelector<HTMLElement>(`[data-receipt-id="${CSS.escape(selectedReceipt.id)}"]`);
    receipt.querySelector<HTMLElement>('[aria-label="Close receipt details"]')?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, [selectedReceipt, view]);


  function updateRun(next: Run) {
    setState(current => current ? { ...current, runs: [next, ...current.runs.filter(item => item.id !== next.id)] } : current);
    setSelectedId(next.id);
  }
  const perform = useCallback(async (id: string, action: 'advance' | 'pause' | 'shock' | 'approve', body: unknown = {}) => {
    if (requestInFlight.current) return null;
    requestInFlight.current = true; setBusy(action); setError('');
    try {
      const next = await api<Run>(`/api/runs/${id}/${action}`, body);
      setState(current => current ? { ...current, runs: [next, ...current.runs.filter(item => item.id !== next.id)] } : current);
      if (['completed', 'awaiting_approval', 'failed', 'paused'].includes(next.status)) setAutoRunId(null);
      return next;
    } catch (e) { setAutoRunId(null); setError(e instanceof Error ? e.message : 'Action failed.'); return null; }
    finally { requestInFlight.current = false; setBusy(null); }
  }, []);
  useEffect(() => {
    if (!autoRunId || !run || run.id !== autoRunId || busy || !['ready', 'running'].includes(run.status)) return;
    const timer = setTimeout(() => { void perform(run.id, 'advance'); }, 1700);
    return () => clearTimeout(timer);
  }, [autoRunId, run, busy, perform]);

  function navigate(next: View) { setView(next); setConfigure(false); setMobileNav(false); setSelectedReceipt(null); window.scrollTo(0, 0); }
  function newRun() { setConfigure(true); setView('overview'); setMobileNav(false); setError(''); window.scrollTo(0, 0); }
  async function create(start: boolean) {
    setBusy('create'); setError('');
    try {
      const list = repos.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
      if (!list.length || list.length > 3 || list.some(item => !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(item))) throw new Error('Enter one to three public repositories in owner/repository format.');
      const atomic = (value: string, scale: number, label: string) => {
        const parsed = Number(value); const amount = Math.round(parsed * scale);
        if (!value.trim() || !Number.isFinite(parsed) || parsed <= 0 || !Number.isSafeInteger(amount) || amount <= 0) throw new Error(`Enter a valid positive ${label}.`);
        return amount;
      };
      const minutes = Number(expiry);
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Mandate duration must be between 1 and 1,440 minutes.');
      const mandate: Omit<Mandate, 'version'> = {
        dataBudgetAtomic: atomic(dataBudget, 1e8, 'data budget'), maxDataUnitPriceAtomic: atomic(unitPrice, 1e8, 'unit-price limit'),
        verificationBudgetAtomic: atomic(verificationBudget, 1e6, 'verification budget'),
        allowedProviders: providers.split(',').map(item => item.trim()).filter(Boolean), expiresAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      };
      if (!mandate.allowedProviders.length) throw new Error('Allow at least one provider.');
      const created = await api<Run>('/api/runs', { repos: list, mode, mandate });
      updateRun(created); setConfigure(false); setView('overview'); if (start) setAutoRunId(created.id);
      window.scrollTo(0, 0);
      setNotice(start ? 'Research started. Your spending limits are active.' : 'Run created. Start whenever you are ready.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create run.'); }
    finally { setBusy(null); }
  }
  async function startRun() {
    if (!run) return;
    if (run.status === 'paused') { const next = await perform(run.id, 'pause'); if (next?.status === 'running' || next?.status === 'ready') setAutoRunId(run.id); }
    else setAutoRunId(run.id);
  }
  async function pauseRun() {
    setAutoRunId(null); if (run) await perform(run.id, 'pause');
  }
  async function exportRun() {
    if (!run) return;
    setBusy('export'); setError('');
    try {
      const response = await fetch(`/api/runs/${run.id}/export`);
      if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Export failed.'); }
      saveText(`obolos-${shortId(run.id)}.json`, await response.text(), 'application/json'); setNotice('Evidence bundle downloaded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setBusy(null); }
  }
  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy('login'); setError('');
    try { await api('/api/operator', { token }); setToken(''); await refresh(); setNotice('Operator authenticated for this browser session.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed.'); }
    finally { setBusy(null); }
  }
  async function copyApproval() {
    try { await navigator.clipboard.writeText(run?.approval?.message ?? ''); setNotice('Approval message copied.'); }
    catch { setError('Clipboard unavailable. Download the approval message instead.'); }
  }
  const liveBlocked = mode === 'live' && (!state?.liveEnabled || !state?.operatorAuthenticated);
  const busyIcon = <Loader2 size={15} className="spin" />;

  const navigationItems = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard },
    { id: 'runs', label: 'Research runs', shortLabel: 'Runs', icon: Waypoints },
    { id: 'receipts', label: 'Payments & receipts', shortLabel: 'Payments', icon: ReceiptText },
    { id: 'providers', label: 'Provider directory', shortLabel: 'Providers', icon: Globe2 },
  ] as const;
  const currentViewName = { overview: 'Overview', runs: 'Research runs', receipts: 'Payments & receipts', providers: 'Provider directory', connections: 'Connections', report: 'Research report' }[view];
  const activeMode = run && !configure ? run.mode : mode;
  const showInspector = ((view === 'overview' || view === 'report') && !isSetup) || (view === 'receipts' && !!selectedReceipt);

  return <div className="app-shell">
    {mobileNav && <div className="nav-scrim" aria-hidden="true" onClick={() => setMobileNav(false)} />}
    <aside ref={navigationRef} className={`mobile-navigation ${mobileNav ? 'navigation-open' : ''}`} role={mobileNav ? 'dialog' : undefined} aria-modal={mobileNav ? true : undefined} aria-label="Workspace navigation">
      <div className="mobile-navigation-heading"><strong>Obolos</strong><button className="icon-button" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={22} /></button></div>
      <nav aria-label="Mobile navigation">
        {navigationItems.map(item => <button key={item.id} className={`mobile-nav-item ${view === item.id ? 'active' : ''}`} onClick={() => navigate(item.id)}><item.icon size={20} />{item.label}<ArrowUpRight size={16} /></button>)}
        <button className="mobile-nav-item" onClick={() => navigate('connections')}><Settings2 size={20} />Connections<ArrowUpRight size={16} /></button>
      </nav>
      <button className="button primary mobile-create" onClick={newRun}><Plus size={17} />New research run</button>
      {!!state?.runs.length && <div className="mobile-recent"><p>Recent runs</p>{state.runs.slice(0, 4).map(item => <button key={item.id} onClick={() => { setSelectedId(item.id); navigate('overview'); }}><span>{item.repos[0]}{item.repos.length > 1 ? ` +${item.repos.length - 1}` : ''}</span><ChevronRight size={15} /></button>)}</div>}
      <p className="mobile-navigation-note">Your workspace.<br />Your agents. Your boundaries.</p>
    </aside>
    <div className="app-main" inert={mobileNav ? true : undefined}>
      <header className="global-header">
        <a className="brand" href="/" aria-label="Obolos home"><img src="/brand/obolos-symbol-black.png" width={38} height={38} alt="" style={{ objectFit: 'contain', flexShrink: 0 }} /><span>Obolos</span></a>
        <nav className="global-navigation" aria-label="Main navigation">{navigationItems.map(item => <button key={item.id} aria-label={item.label} aria-current={view === item.id || (item.id === 'overview' && view === 'report') ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.shortLabel}</button>)}</nav>
        <form className="global-search" role="search" aria-label="Search workspace" onSubmit={event => { event.preventDefault(); navigate('runs'); }}><Search size={18} /><input aria-label="Search workspace runs" placeholder="Search your research" value={runSearch} onChange={event => setRunSearch(event.target.value)} /><kbd>↵</kbd></form>
        <div className="header-actions"><button className="icon-button connection-button" aria-label="Connections" aria-current={view === 'connections' ? 'page' : undefined} onClick={() => navigate('connections')}><Settings2 size={19} /></button><button className="button primary header-create" aria-label="New research run" onClick={newRun}><Plus size={16} />Create</button><span className="operator-avatar" title="Local operator">YO</span><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={22} /></button></div>
      </header>
      <div className="workspace-context"><div className="breadcrumb"><span>My workspace</span><ChevronRight size={14} /><strong>{currentViewName}</strong></div><div className="context-actions"><span className={`environment ${activeMode}`}><FlaskConical size={14} />{activeMode === 'rehearsal' ? 'Rehearsal environment' : 'Live · testnets'}</span><button className="icon-button" aria-label="Refresh workspace" onClick={() => void refresh()}><RefreshCw size={15} /></button></div></div>
      {error && <div className="error-banner" role="alert"><TriangleAlert size={17} /><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
      {!state ? <div className="loading-state"><Loader2 className="spin" size={24} /><p>Opening your workspace…</p>{error && <button className="button" onClick={() => void refresh()}>Try again</button>}</div> : <div className={`workspace-body ${showInspector ? 'has-inspector' : ''}`}>
        <main className="content-area">
          {view === 'overview' && <>
            {isSetup ? <>
              <div className="welcome-top"><div className="eyebrow">A new kind of workforce</div><span className="quiet-caption">Human direction. Agent execution.</span></div>
              <section className="welcome"><div><h1>Put your agents<br />to work<span className="heading-dot">.</span></h1><p>From a research question to a verified report.<br className="desktop-break" /> Every decision bounded. Every payment accounted for.</p><div className="welcome-meta"><span><ShieldCheck size={14} />Human-defined limits</span><span><ReceiptText size={14} />Traceable spending</span></div></div><figure className="workflow-art"><div className="art-frame"><Image src="/illustrations/agent-workforce.png" alt="Three illustrated robot coworkers passing a payment token and a research report" width={600} height={400} priority /></div><figcaption><span>The work is theirs. The boundaries are yours.</span><ArrowUpRight size={16} /></figcaption></figure></section>
              <section className="setup-card"><div className="section-heading"><div><h2>Start a research run</h2><p>Compare public GitHub repositories with source-backed evidence.</p></div><span className="step-label"><ShieldCheck size={14} />Your mandate</span></div>
                <form onSubmit={event => { event.preventDefault(); void create(true); }}>
                  <div className="setup-grid"><div className="repository-input"><label htmlFor="repositories">What should your agents research?<span>Up to 3 repositories</span></label><div className="repo-field"><GitBranch size={17} /><textarea id="repositories" value={repos} onChange={event => setRepos(event.target.value)} rows={3} spellCheck={false} placeholder="owner/repository" required /></div><p className="field-hint">One public GitHub repository per line. Compare activity, adoption and licensing.</p></div><div className="mode-choice"><label>Execution mode</label><div className="segmented" role="group" aria-label="Execution mode"><button type="button" aria-pressed={mode === 'rehearsal'} className={mode === 'rehearsal' ? 'selected' : ''} onClick={() => setMode('rehearsal')}><FlaskConical size={14} />Rehearsal</button><button type="button" aria-pressed={mode === 'live'} className={mode === 'live' ? 'selected' : ''} onClick={() => setMode('live')}><Zap size={14} />Live testnet</button></div><p className="mode-help">{mode === 'rehearsal' ? 'Explore the full workflow with fixture data and simulated payments. No funds move.' : 'Fetch current data and settle testnet payments through your configured broker.'}</p>{liveBlocked && <button type="button" className="text-link" onClick={() => navigate('connections')}>Configure live connections<ArrowUpRight size={12} /></button>}</div></div>
                  <div className="budget-heading"><span><Wallet size={15} />Spending boundaries</span><button type="button" className="text-link muted-link" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>{advanced ? 'Hide' : 'Edit'} mandate<ChevronDown size={13} className={advanced ? 'rotate' : ''} /></button></div>
                  <div className="budget-summary"><div><span>Data allowance</span><strong>{dataBudget || '0'} <small>HBAR</small></strong><p>Hedera testnet</p></div><div><span>Maximum per repository</span><strong>{unitPrice || '0'} <small>HBAR</small></strong><p>Unit-price ceiling</p></div><div><span>Verification allowance</span><strong>{verificationBudget || '0'} <small>USDC</small></strong><p>Arc testnet</p></div></div>
                  {advanced && <div className="mandate-fields"><label>Data budget · HBAR<input type="number" min="0.00000001" step="0.00000001" value={dataBudget} onChange={event => setDataBudget(event.target.value)} required /></label><label>Maximum unit price · HBAR<input type="number" min="0.00000001" step="0.00000001" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} required /></label><label>Verification budget · USDC<input type="number" min="0.000001" step="0.000001" value={verificationBudget} onChange={event => setVerificationBudget(event.target.value)} required /></label><label className="wide-field">Allowed data provider IDs<input value={providers} onChange={event => setProviders(event.target.value)} placeholder="repo-standard, repo-economy" required /></label><label>Expires after · minutes<input type="number" min="1" max="1440" value={expiry} onChange={event => setExpiry(event.target.value)} required /></label><p className="field-hint wide-field">Allowances are separate for each network. Unspent limits are not wallet balances.</p></div>}
                  <div className="setup-footer"><span><LockKeyhole size={13} />Agents cannot raise their own limits.</span><div><button type="button" className="button setup-only" disabled={!!busy || liveBlocked} onClick={() => void create(false)}>Set up only</button><button type="submit" className="button primary" disabled={!!busy || liveBlocked}>{busy === 'create' ? busyIcon : <Play size={14} fill="currentColor" />}Start research<ArrowRight size={15} /></button></div></div>
                </form>
              </section>
              <section className="how-it-works"><div className="section-heading"><h2>Meet your workflow.</h2><span className="quiet-caption">Five stages. One clear mandate.</span></div><div className="workflow-strip">{stages.map((item, index) => <div key={item.id}><span className="workflow-number">0{index + 1}</span><item.icon size={20} strokeWidth={1.5} /><strong>{item.name}</strong><p>{item.description}</p></div>)}</div></section>
            </> : <>
              <div className="run-heading"><div><div className="eyebrow">RESEARCH RUN <span className="mono">{shortId(run.id)}</span></div><h1>{run.title || 'Repository comparison'}</h1><p>{run.repos.join('  /  ')}<span className="inline-separator">·</span>Created {date(run.createdAt)}</p></div><button className="button" onClick={() => void exportRun()} disabled={!!busy}><ArrowDownToLine size={14} />Export</button></div>
              <div className="run-tabs"><button className="active">Overview</button><button onClick={() => navigate('report')}>Report {run.report && <span className="tab-count">1</span>}</button><button onClick={() => navigate('receipts')}>Receipts <span className="tab-count">{run.receipts.length}</span></button><div><Status run={run} /></div></div>
              {run.mode === 'rehearsal' && <div className="rehearsal-banner"><FlaskConical size={16} /><span><strong>Rehearsal run</strong> · Repository evidence is a fixture. All payments and approvals are simulated.</span></div>}
              <div className="run-metrics"><div><span>Data spending<CircleDollarSign size={15} /></span><strong>{money(run.dataSpentAtomic, 'HBAR')}</strong><small>of {money(run.mandate.dataBudgetAtomic, 'HBAR')} allowance</small><div className="meter"><i style={{ width: `${Math.min(100, run.dataSpentAtomic / run.mandate.dataBudgetAtomic * 100)}%` }} /></div></div><div><span>Verification spending<CheckCheck size={15} /></span><strong>{money(run.verificationSpentAtomic, 'USDC')}</strong><small>of {money(run.mandate.verificationBudgetAtomic, 'USDC')} allowance</small><div className="meter"><i style={{ width: `${Math.min(100, run.verificationSpentAtomic / run.mandate.verificationBudgetAtomic * 100)}%` }} /></div></div><div><span>Evidence collected<FolderGit2 size={15} /></span><strong>{run.evidence.length}<small className="metric-denominator"> / {run.repos.length}</small></strong><small>repositories · {run.receipts.length} payment receipts</small><div className="meter"><i style={{ width: `${run.evidence.length / run.repos.length * 100}%` }} /></div></div></div>
              {run.approval && <section className="approval-card"><div className="approval-icon"><Fingerprint size={23} /></div><div className="approval-content"><div className="eyebrow">HUMAN DECISION REQUIRED</div><h2>Your agent reached a boundary.</h2><p>{run.approval.reason}</p><div className="approval-changes"><div><span>Data allowance</span><strong>{money(run.mandate.dataBudgetAtomic, 'HBAR')}<ArrowRight size={13} />{money(run.approval.proposedMandate.dataBudgetAtomic, 'HBAR')}</strong></div><div><span>Price ceiling / repository</span><strong>{money(run.mandate.maxDataUnitPriceAtomic, 'HBAR')}<ArrowRight size={13} />{money(run.approval.proposedMandate.maxDataUnitPriceAtomic, 'HBAR')}</strong></div></div><p className="field-hint">Approval expires {date(run.approval.expiresAt)}. The proposed mandate applies only to this run.</p>{run.mode === 'live' && <><details className="approval-message"><summary>Review the exact message to sign</summary><pre>{run.approval.message}</pre></details><div className="approval-message-actions"><button className="button" onClick={() => void copyApproval()}><Clipboard size={13} />Copy message</button><button className="button" onClick={() => saveText(`approval-${shortId(run.id)}.json`, approvalFile(run), 'application/json')}><ArrowDownToLine size={13} />Download approval JSON</button></div><p className="field-hint">{run.approval.signerMode === 'speculos' ? 'Review and sign in the Speculos emulator using the local approval script. This is a development signature, not physical Ledger proof.' : 'Sign this message on your physical Ledger using the local approval script, then paste its signature below.'}</p><label className="signature-field">Ledger signature<textarea value={signature} onChange={event => setSignature(event.target.value)} placeholder="0x…" rows={2} spellCheck={false} /></label></>}<button className="button primary" disabled={!!busy || (run.mode === 'live' && !signature.trim())} onClick={async () => { const next = await perform(run.id, 'approve', run.mode === 'live' ? { signature: signature.trim() } : {}); if (next) { setSignature(''); setNotice('Mandate updated. Resume the run when ready.'); } }}>{busy === 'approve' ? busyIcon : <ShieldCheck size={15} />}{run.mode === 'rehearsal' ? 'Simulate approval & update limits' : 'Verify Ledger signature & update limits'}</button></div></section>}
              {run.error && <div className="inline-error"><TriangleAlert size={18} /><div><strong>This run needs attention</strong><p>{run.error}</p></div></div>}
              <section className="run-workflow panel"><div className="section-heading"><div><h2>Execution plan</h2><p>Every stage operates inside your mandate.</p></div><span className="quiet-caption">{run.stage === 'complete' ? '5' : stages.findIndex(item => item.id === run.stage)} / 5 stages complete</span></div><div className="stage-list">{stages.map((item, index) => { const stageIndex = run.stage === 'complete' ? 5 : stages.findIndex(stage => stage.id === run.stage); const done = index < stageIndex; const current = index === stageIndex; return <div className={`stage-row ${done ? 'done' : ''} ${current ? 'current' : ''}`} key={item.id}><span className="stage-state">{done ? <Check size={15} /> : current && autoRunId ? <Loader2 size={16} className="spin" /> : <span>{index + 1}</span>}</span><item.icon size={18} strokeWidth={1.6} /><div><strong>{item.name}</strong><p>{item.description}</p></div><span className="stage-tag">{done ? 'Complete' : current ? run.status === 'awaiting_approval' ? 'Blocked' : 'Current stage' : 'Queued'}</span>{done && <Check size={13} className="subtle" />}</div>; })}</div><div className="run-controls"><div>{['ready', 'running', 'paused'].includes(run.status) && <>{autoRunId === run.id ? <button className="button" disabled={!!busy} onClick={() => void pauseRun()}><Pause size={14} />Pause run</button> : <button className="button primary" disabled={!!busy} onClick={() => void startRun()}><Play size={14} fill="currentColor" />{run.status === 'paused' ? 'Resume research' : 'Run research'}</button>}{!autoRunId && run.status !== 'paused' && <button className="button" disabled={!!busy} onClick={() => void perform(run.id, 'advance')}>{busy === 'advance' ? busyIcon : <ArrowRight size={14} />}Advance one step</button>}</>}{run.status === 'completed' && <button className="button primary" onClick={() => navigate('report')}><FileCheck2 size={15} />Open research report<ArrowRight size={14} /></button>}{run.status === 'failed' && <button className="button" onClick={newRun}><Plus size={14} />Create a new run</button>}</div>{(run.mode === 'rehearsal' || state.priceControlsEnabled) && !run.shockApplied && !run.dataSpentAtomic && !['completed', 'failed'].includes(run.status) && <button className="button orange" disabled={!!busy} onClick={async () => { setAutoRunId(null); const next = await perform(run.id, 'shock'); if (next) setNotice('Provider prices increased. Advance the run to evaluate the new quotes.'); }}><Zap size={14} />{run.mode === 'live' ? 'Raise live provider prices' : 'Simulate price change'}</button>}{run.mode === 'live' && state.priceControlsEnabled && !run.shockApplied && <p className="field-hint">Price controls change this service’s actual quotes for all jobs.</p>}{run.shockApplied && <span className="shock-note"><Zap size={13} />Price change applied</span>}</div></section>
              <ProviderTable run={run} />
              {run.report && <section className="report-preview panel"><div className="report-preview-icon"><FileCheck2 size={24} strokeWidth={1.4} /></div><div><span className="eyebrow">RESEARCH OUTPUT</span><h2>{run.report.title}</h2><p>{run.report.summary}</p></div><button className="icon-button" onClick={() => navigate('report')} aria-label="Open research report"><ArrowUpRight size={22} /></button></section>}
            </>}
          </>}
          {view === 'runs' && <><PageHeading eyebrow="YOUR WORKSPACE" title="Research runs" description="A complete history of the work you delegated." action={<button className="button primary" onClick={newRun}><Plus size={15} />New research run</button>} /><div className="table-toolbar"><div className="search-field"><Search size={15} /><input aria-label="Search research runs" placeholder="Search by repository or run ID…" value={runSearch} onChange={event => setRunSearch(event.target.value)} /></div><span>{state.runs.length} runs</span></div>{!!state.runs.length && <div className="run-gallery">{state.runs.filter(item => `${item.id} ${item.repos.join(' ')}`.toLowerCase().includes(runSearch.toLowerCase())).slice(0, 3).map(item => <button className="run-gallery-card" key={item.id} onClick={() => { setSelectedId(item.id); navigate('overview'); }}><div className="run-gallery-frame"><div className="gallery-card-meta"><span>{item.mode === 'rehearsal' ? 'Rehearsal' : 'Live testnet'}</span><span>{item.repos.length} repositories</span></div><div className="gallery-repos">{item.repos.map((repo, index) => <div key={repo}><span>0{index + 1}</span><strong>{repo.split('/')[1]}</strong><ArrowUpRight size={20} /></div>)}</div><div className="gallery-stage"><span>{item.stage === 'complete' ? 'Research complete' : stages.find(stage => stage.id === item.stage)?.name}</span><ArrowRight size={17} /></div></div><div className="gallery-card-caption"><div><h3>{item.title}</h3><p>{date(item.createdAt)}</p></div><Status run={item} /></div></button>)}</div>}{!state.runs.length ? <Empty icon={Waypoints} title="Your first run starts here" detail="Give your agents a question and a spending boundary. Every run will be saved in this workspace." /> : <div className="table-scroll"><table className="data-table run-table"><thead><tr><th>Research</th><th>Status</th><th>Mode</th><th>Data spending</th><th>Created</th><th /></tr></thead><tbody>{state.runs.filter(item => `${item.id} ${item.repos.join(' ')}`.toLowerCase().includes(runSearch.toLowerCase())).map(item => <tr key={item.id} onClick={() => { setSelectedId(item.id); navigate('overview'); }}><td><button className="table-link" onClick={() => { setSelectedId(item.id); navigate('overview'); }}><span className="table-icon"><GitBranch size={16} /></span><span>{item.title}<small>{item.repos.join(', ')}</small></span></button></td><td><Status run={item} /></td><td><span className="neutral-tag">{item.mode}</span></td><td className="mono">{money(item.dataSpentAtomic, 'HBAR')}</td><td className="subtle">{date(item.createdAt)}</td><td><ChevronRight size={14} /></td></tr>)}</tbody></table>{!!runSearch && !state.runs.some(item => `${item.id} ${item.repos.join(' ')}`.toLowerCase().includes(runSearch.toLowerCase())) && <Empty icon={Search} title="No matching runs" detail="Try a repository name or clear your search." />}</div>}</>}
          {view === 'receipts' && <><PageHeading eyebrow="SPENDING, ACCOUNTED FOR" title="Payments & receipts" description="Every service purchase, with its network and settlement evidence." action={run ? <button className="button" disabled={!!busy} onClick={() => void exportRun()}><ArrowDownToLine size={14} />Export selected run</button> : undefined} /><div className="receipt-summary"><div><span>Receipts recorded</span><strong>{allReceipts.length}</strong></div><div><span>Hedera · HBAR</span><strong>{money(allReceipts.filter(item => item.asset === 'HBAR' && item.status === 'settled').reduce((sum, item) => sum + item.amountAtomic, 0), 'HBAR')}</strong><small>Confirmed settlement only</small></div><div><span>Arc · USDC</span><strong>{money(allReceipts.filter(item => item.asset === 'USDC' && item.status === 'settled').reduce((sum, item) => sum + item.amountAtomic, 0), 'USDC')}</strong><small>Confirmed settlement only</small></div></div><div className="section-heading table-title"><h2>All transactions</h2><span className="quiet-caption">{allReceipts.filter(item => item.status === 'simulated').length} simulated · {allReceipts.filter(item => item.status === 'settled').length} settled</span></div>{!allReceipts.length ? <Empty icon={ReceiptText} title="A paper trail for every payment" detail="Complete a data purchase or verification stage to see receipts here. Rehearsal receipts are clearly marked as simulated." /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Provider</th><th>Amount</th><th>Network</th><th>Status</th><th>Date</th><th /></tr></thead><tbody>{allReceipts.map(item => <tr key={item.id} className={selectedReceipt?.id === item.id ? 'selected-row' : ''} onClick={() => setSelectedReceipt(item)}><td><button className="table-link" data-receipt-id={item.id} aria-haspopup="dialog" onClick={() => setSelectedReceipt(item)}><span className="table-icon"><ReceiptText size={16} /></span><span>{item.provider}<small>{item.units} service {item.units === 1 ? 'unit' : 'units'}</small></span></button></td><td className="mono">{money(item.amountAtomic, item.asset)}</td><td><span className="neutral-tag">{item.network}</span></td><td><span className={`status ${item.status === 'settled' ? 'status-completed' : ''}`}><span className="status-dot" />{item.status === 'simulated' ? 'Simulated' : 'Settled'}</span></td><td className="subtle">{date(item.timestamp)}</td><td><ChevronRight size={14} /></td></tr>)}</tbody></table></div>}</>}
          {view === 'providers' && <><PageHeading eyebrow="A MARKETPLACE WITH BOUNDARIES" title="Provider directory" description="Agents compare quotes across the providers in your mandate." />{run ? <><div className="info-strip"><ShieldCheck size={16} /><span>Showing quotes for run <strong className="mono">{shortId(run.id)}</strong>. Only allowed providers can receive a data purchase.</span></div><ProviderTable run={run} /><section className="network-notes"><div><span className="network-logo">ℏ</span><h3>Data on Hedera</h3><p>Repository evidence is priced per repository in HBAR on Hedera testnet.</p></div><div><span className="network-logo">$</span><h3>Verification on Arc</h3><p>Report verification uses a separate USDC allowance on Arc testnet.</p></div></section></> : <Empty icon={Globe2} title="Discover providers through a run" detail="Create a research run and advance provider discovery to inspect its quotes, allowlist and selection." />}</>}
          {view === 'connections' && <><PageHeading eyebrow="WORKSPACE SETTINGS" title="Connections" description="The services that let your agents research, pay and verify." /><LiveConnections operatorAuthenticated={state.operatorAuthenticated} /><div className="connection-status panel"><ShieldCheck size={23} /><div><h2>{state.liveEnabled && state.operatorAuthenticated ? 'Live execution is available' : 'Rehearsal is ready. Live needs configuration.'}</h2><p>{state.liveEnabled ? 'The broker reports that its required integrations are configured.' : 'Configure the capability broker and required testnet integrations to enable live execution.'} {state.operatorAuthenticated ? 'This browser is authenticated.' : 'Authenticate the operator for this browser session below.'}</p></div><span className="neutral-tag">Testnets only</span></div><div className="integration-list">{state.integrations.length ? state.integrations.map(item => <div className="integration-row" key={item.id}><span className="integration-icon">{item.id.includes('ledger') ? <Fingerprint size={20} /> : item.id.includes('hedera') ? <span>ℏ</span> : item.id.includes('circle') || item.id.includes('arc') ? <CircleDollarSign size={20} /> : <Waypoints size={20} />}</span><div><h3>{item.name}</h3><p>{item.detail}</p></div><span className={`status ${item.ready ? 'status-completed' : ''}`}><span className="status-dot" />{item.ready ? 'Configured' : 'Not configured'}</span></div>) : <Empty icon={Waypoints} title="No integration health reported" detail="Start the capability broker to expose integration status. Rehearsal remains available." />}</div><section className="operator-card panel"><div className="section-heading"><div><h2>Operator authentication</h2><p>Your server token unlocks live actions for this browser session.</p></div><LockKeyhole size={20} /></div>{state.operatorAuthenticated ? <div className="authenticated"><Check size={17} />Operator authenticated</div> : <form onSubmit={event => void login(event)}><label htmlFor="operator-token">Operator token</label><div className="token-row"><input id="operator-token" type="password" autoComplete="off" placeholder="Enter the configured operator token" value={token} onChange={event => setToken(event.target.value)} required /><button className="button primary" disabled={!!busy || !token}>{busy === 'login' ? busyIcon : <LockKeyhole size={14} />}Authenticate</button></div></form>}<p className="field-hint">Wallet keys and provider credentials stay in the separate capability broker. Configuration does not prove a settled payment.</p></section></>}
          {view === 'report' && <><PageHeading eyebrow="SOURCE-BACKED RESEARCH" title={run?.report?.title ?? 'Research report'} description={run ? `Run ${shortId(run.id)} · ${run.repos.length} repositories` : 'The result of your agents’ research and verification.'} action={run ? <button className="button" onClick={() => void exportRun()} disabled={!!busy}><ArrowDownToLine size={14} />Export evidence</button> : undefined} />{!run?.report ? <Empty icon={FileText} title="Your report is still ahead" detail="Complete the research and report stages. The result, source evidence and verification checks will appear here." /> : <>{run.mode === 'rehearsal' && <div className="rehearsal-banner"><FlaskConical size={16} />Rehearsal report · Based on fixture evidence with simulated payments.</div>}<div className="report-status"><span className={`status ${run.report.verified ? 'status-completed' : ''}`}><span className="status-dot" />{run.report.verified ? 'Source checks passed' : 'Source checks pending'}</span><span className="quiet-caption">{run.report.generatedBy === 'model' ? 'Model-generated' : 'Template-generated'} · {date(run.report.createdAt)}</span></div><article className="report-body"><h2>Summary</h2><p>{run.report.summary}</p><h2>Recommendation</h2><p>{run.report.recommendation}</p></article>{Boolean(run.authorizations?.length) && <section className="verification-panel panel"><div className="section-heading"><div><h2>Mandate authorization history</h2><p>Exact authorization messages and proofs are included in the evidence export.</p></div><Fingerprint size={21} /></div>{run.authorizations!.map(proof => <details className="approval-message" key={proof.nonce}><summary>Mandate {proof.previousMandate.version} → {proof.approvedMandate.version} · {proof.mode === 'live' ? (proof.signerMode === 'speculos' ? 'Speculos emulator signature verified' : 'Controller signature verified') : 'Simulated approval'} · {date(proof.verifiedAt)}</summary><pre>{proof.message}{proof.signer ? `\n\nSigner: ${proof.signer}\nSignature: ${proof.signature}` : '\n\nRehearsal: no hardware signature.'}</pre></details>)}</section>}<section className="evidence-section"><div className="section-heading"><h2>Repository evidence</h2><span className="quiet-caption">{run.report.evidence.length} sources</span></div>{run.report.evidence.map(item => <div className="evidence-card" key={item.repo}><div className="evidence-title"><span className="table-icon"><GitBranch size={17} /></span><div><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.repo}<ArrowUpRight size={13} /></a><p>{item.description}</p></div></div><dl className="evidence-metrics"><div><dt>Stars</dt><dd>{item.stars.toLocaleString()}</dd></div><div><dt>Forks</dt><dd>{item.forks.toLocaleString()}</dd></div><div><dt>Open issues</dt><dd>{item.openIssues.toLocaleString()}</dd></div><div><dt>Language</dt><dd>{item.language}</dd></div><div><dt>License</dt><dd>{item.license}</dd></div></dl><div className="evidence-footer"><span>Last push {date(item.pushedAt)}</span><span>{run.mode === 'rehearsal' ? 'Fixture timestamp' : 'Fetched'} {date(item.fetchedAt)}</span></div></div>)}</section><section className="verification-panel panel"><div className="section-heading"><div><h2>Verification checks</h2><p>Structural and source-integrity checks on the purchased evidence. Narrative claims are not independently certified.</p></div><FileCheck2 size={21} /></div>{run.report.checks.length ? run.report.checks.map((item, index) => <div className="check-row" key={index}>{item.passed ? <Check size={17} className="success-text" /> : <TriangleAlert size={17} className="warning-text" />}<div><strong>{item.label}</strong><p>{item.detail}</p></div><span className="neutral-tag">{item.passed ? 'Passed' : 'Failed'}</span></div>) : <p className="field-hint">Checks will appear after the verification stage.</p>}</section></>}</>}
          <footer className="content-footer"><span className="footer-brand"><img src="/brand/obolos-symbol-black.png" width={24} height={24} alt="" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 7 }} />Obolos</span><span>Work, within limits.</span><span>Hedera + Arc testnets</span></footer>
        </main>
        {(view === 'overview' || view === 'report') && !isSetup && <aside className="inspector"><div className="inspector-title"><span>Run activity</span><Activity size={17} /></div><div className="rail-run-status"><Status run={run!} /><p>Updated {date(run!.updatedAt)}</p></div><div className="activity-feed">{run!.events.length ? [...run!.events].reverse().map(event => <div className={`activity-event event-${event.kind}`} key={event.id}><span className="event-icon">{event.kind === 'success' ? <Check size={12} /> : event.kind === 'blocked' || event.kind === 'warning' ? <TriangleAlert size={12} /> : <Circle size={9} />}</span><div><div className="event-meta"><span>{event.actor}</span><time>{new Date(event.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time></div><strong>{event.title}</strong><p>{event.detail}</p></div></div>) : <p className="field-hint">The decision trail will appear as your run advances.</p>}</div><div className="rail-section mandate-rail"><div className="rail-label">ACTIVE MANDATE<span>V{run!.mandate.version}</span></div><dl><div><dt>Data allowance</dt><dd>{money(run!.mandate.dataBudgetAtomic, 'HBAR')}</dd></div><div><dt>Price ceiling</dt><dd>{money(run!.mandate.maxDataUnitPriceAtomic, 'HBAR')}</dd></div><div><dt>Verification</dt><dd>{money(run!.mandate.verificationBudgetAtomic, 'USDC')}</dd></div><div><dt>Expires</dt><dd>{date(run!.mandate.expiresAt)}</dd></div></dl><p className="field-hint">Allowed: {run!.mandate.allowedProviders.join(', ')}</p><div className="mandate-seal"><LockKeyhole size={12} />{run!.mode === 'rehearsal' ? 'Rehearsal authorization' : 'Operator-authorized boundaries'}</div></div></aside>}
        {view === 'receipts' && selectedReceipt && <aside ref={receiptRef} className="inspector receipt-inspector" role="dialog" aria-modal="false" aria-labelledby="receipt-inspector-title" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setSelectedReceipt(null); } }}><div className="inspector-title"><span id="receipt-inspector-title">Receipt details</span><button className="icon-button" aria-label="Close receipt details" onClick={() => setSelectedReceipt(null)}><X size={15} /></button></div><div className="receipt-amount"><span className="empty-icon"><ReceiptText size={25} strokeWidth={1.4} /></span><h2>{money(selectedReceipt.amountAtomic, selectedReceipt.asset)}</h2><p>{selectedReceipt.provider}</p><span className={`status ${selectedReceipt.status === 'settled' ? 'status-completed' : ''}`}><span className="status-dot" />{readable(selectedReceipt.status)}</span></div><dl className="receipt-details"><div><dt>Network</dt><dd>{selectedReceipt.network}</dd></div><div><dt>Mode</dt><dd>{selectedReceipt.mode}</dd></div><div><dt>Units</dt><dd>{selectedReceipt.units}</dd></div><div><dt>Recorded</dt><dd>{date(selectedReceipt.timestamp)}</dd></div><div><dt>Receipt ID</dt><dd className="mono">{selectedReceipt.id}</dd></div><div><dt>Request ID</dt><dd className="mono">{selectedReceipt.requestId}</dd></div>{selectedReceipt.transactionId && <div><dt>Transaction ID</dt><dd className="mono">{selectedReceipt.transactionId}</dd></div>}</dl>{selectedReceipt.explorerUrl && <a className="button explorer-button" href={selectedReceipt.explorerUrl} target="_blank" rel="noreferrer">View on explorer<ArrowUpRight size={13} /></a>}{selectedReceipt.status === 'simulated' && <div className="receipt-simulation-note"><FlaskConical size={17} /><p>This is a simulated receipt. No on-chain transaction occurred and no funds moved.</p></div>}</aside>}
      </div>}
    </div>
  </div>;
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
function ProviderTable({ run }: { run: Run }) {
  return <section className="provider-panel panel"><div className="section-heading"><div><h2>Provider quotes</h2><p>{run.mode === 'rehearsal' ? 'Rehearsal quotes · simulated services' : 'Discovered service quotes · Hedera testnet'}</p></div><span className="neutral-tag">{run.providers.length} available</span></div>{!run.providers.length ? <div className="provider-empty"><Search size={19} /><p>Providers appear after the discovery stage.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Data provider</th><th>Unit price</th><th>Policy</th><th>Selection</th></tr></thead><tbody>{run.providers.map(provider => { const allowed = run.mandate.allowedProviders.includes(provider.id); const inRange = provider.unitPriceAtomic <= run.mandate.maxDataUnitPriceAtomic; return <tr key={provider.id}><td><div className="provider-name"><span className="table-icon"><Globe2 size={16} /></span><span>{provider.name}<small>{provider.description}</small></span></div></td><td><strong className="price-value">{money(provider.unitPriceAtomic, provider.asset)}</strong><small className="table-subtitle">per {provider.unit}</small></td><td><span className={`status ${!allowed || !inRange ? 'status-awaiting_approval' : ''}`}><span className="status-dot" />{!allowed ? 'Not allowed' : !inRange ? 'Above ceiling' : 'Within limits'}</span></td><td>{run.selectedProvider === provider.id ? <span className="selected-provider"><Check size={13} />Selected</span> : <span className="subtle">—</span>}</td></tr>; })}</tbody></table></div>}</section>;
}
