'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Run } from '@/lib/contracts';
import {selectionPriceState, priceChangeLabel} from '@/lib/market/price-state';
import type { MarketService } from '@/lib/market/contracts';
import type { MandateFields } from '@/lib/platform/execution-contracts';
import { api, errorMessage, fromAtomic, toAtomic, type Agent } from './api';
import { signOwnerMessage, useBrowserWallets } from './wallets';
import s from './platform.module.css';
import w from './workspace-layout.module.css';

type Runner = { id: string; prefix: string; createdAt: string; lastSeenAt: string | null; revokedAt: string | null; online: boolean };
type Mandate = MandateFields & { message: string; approvedAt: string | null; revokedAt: string | null; reservedRuns: number; signature: string | null };
type Draft = MandateFields & { message: string };
export type Job = { id: string; status: string; repos: string[]; createdAt: string; result?: Run | null; error?: string | null; receiptVerification?: 'runner-confirmed' | 'chain-confirmed' | null };
const activeStatus = (status: string) => status === 'queued' || status === 'running';
const dateLabel = (value: string) => new Date(value).toLocaleString();
function parseRepos(value: string) {
  const repos = value.split('\n').map(repo => repo.trim()).filter(Boolean);
  if (repos.length < 1 || repos.length > 3 || new Set(repos.map(repo => repo.toLowerCase())).size !== repos.length || repos.some(repo => !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) || ['.', '..'].includes(repo.split('/')[1]))) throw new Error('Enter 1–3 unique GitHub repositories, one owner/repository per line.');
  return repos;
}
export function safeExplorerUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash) return null;
    if (url.hostname === 'testnet.arcscan.app' && /^\/tx\/0x[\da-f]{64}$/i.test(url.pathname)) return url.href;
    if (url.hostname === 'hashscan.io' && url.pathname.startsWith('/testnet/transaction/') && /^0\.0\.\d+@\d+\.\d+$/.test(decodeURIComponent(url.pathname.slice('/testnet/transaction/'.length)))) return url.href;
  } catch { /* Non-explorer strings remain plain text. */ }
  return null;
}

export function AgentExecution({ agent, owner, preferredServiceId }: { agent: Agent; owner: string; preferredServiceId?: string }) {
  const [view, setView] = useState<'runner' | 'mandate' | 'run' | null>(preferredServiceId ? 'mandate' : null);
  const [runner, setRunner] = useState<Runner | null>(null);
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [runs, setRuns] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [runnerToken, setRunnerToken] = useState('');
  const [origin, setOrigin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [repos, setRepos] = useState('');
  const [maxRuns, setMaxRuns] = useState(1);
  const [walletId, setWalletId] = useState('');
  const [retry, setRetry] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState('');
  const [services, setServices] = useState<MarketService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [verificationServiceId, setVerificationServiceId] = useState('');
  const wallets = useBrowserWallets();
  const requestRef = useRef<{ key: string; body: string } | null>(null);
  const hydratedRepos = useRef(false);
  const tokenRef = useRef<HTMLTextAreaElement>(null);
  const base = `/api/agents/${agent.id}`;

  const refresh = useCallback(async (signal?: AbortSignal, includeRuns = true) => {
    const results = await Promise.all([api<{ runner: Runner | null }>(`${base}/runner`, { signal }), api<{ mandate: Mandate | null }>(`${base}/mandate`, { signal }), includeRuns ? api<{ runs: Job[] }>(`${base}/runs`, { signal }) : Promise.resolve(null)]);
    if (signal?.aborted) return;
    const catalog = await api<{services: MarketService[]}>('/api/market/services', {signal});
    if (signal?.aborted) return;
    setServices(catalog.services);
    setRunner(results[0].runner); setMandate(results[1].mandate);
    if (!hydratedRepos.current) { hydratedRepos.current = true; if (results[1].mandate) { setRepos(results[1].mandate.repos.join('\n')); if (!results[1].mandate.approvedAt && Date.parse(results[1].mandate.expiresAt) > Date.now()) setDraft(results[1].mandate); } } if (results[2]) setRuns(results[2].runs); setNow(Date.now());
  }, [base]);
  useEffect(() => {
    const controller = new AbortController(); setOrigin(window.location.origin);
    refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ services: MarketService[] }>('/api/market/services', { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return;
      setServices(result.services);
      setVerificationServiceId(current => current || (preferredServiceId ? result.services.find(service => service.id === preferredServiceId)?.id || '' : result.services.find(service => service.priceAtomic <= agent.verificationBudgetAtomic)?.id || ''));
    }).catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)); }).finally(() => { if (!controller.signal.aborted) setServicesLoading(false); });
    return () => controller.abort();
  }, [agent.verificationBudgetAtomic, preferredServiceId]);
  const hasActiveRuns = runs.some(run => activeStatus(run.status));
  useEffect(() => {
    const controller = new AbortController(); let inFlight = false;
    async function poll() {
      if (document.visibilityState !== 'visible' || inFlight) return;
      inFlight = true; setNow(Date.now());
      try { await refresh(controller.signal, hasActiveRuns); } catch (e) { if (!controller.signal.aborted) setError(errorMessage(e)); }
      finally { inFlight = false; }
    }
    const timer = window.setInterval(poll, hasActiveRuns ? 5000 : 10000);
    document.addEventListener('visibilitychange', poll);
    return () => { controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [refresh, hasActiveRuns]);
  useEffect(() => { if (runnerToken) tokenRef.current?.focus(); }, [runnerToken]);

  const runnerActive = !!runner && !runner.revokedAt;
  const runnerOnline = runnerActive && !!runner.lastSeenAt && runner.online && now - Date.parse(runner.lastSeenAt) < 120000;
  const mandateActive = !!mandate?.approvedAt && !mandate.revokedAt && Date.parse(mandate.expiresAt) > now && mandate.reservedRuns < mandate.maxRuns;
  const priceState = selectionPriceState(mandate?.verificationService, services);
  const termsChanged = priceState.state === 'changed' || priceState.state === 'unavailable';
  const ready = runnerOnline && mandateActive && !termsChanged;
  const activeView = view || (ready ? 'run' : !runnerActive ? 'runner' : !mandateActive ? 'mandate' : 'runner');
  async function perform(label: string, action: () => Promise<void>) {
    setBusy(label); setError(''); setNotice(''); setNow(Date.now());
    try { await action(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  }
  async function pair() {
    await perform('pair', async () => { const result = await api<{ runner: Runner; token: string }>(`${base}/runner`, { method: 'POST', body: '{}' }); setView('runner'); setRunner(result.runner); setRunnerToken(result.token); setConfirm(''); });
  }
  async function revoke(kind: 'runner' | 'mandate') {
    await perform(`revoke-${kind}`, async () => { await api(`${base}/${kind}`, { method: 'DELETE' }); if (kind === 'runner') setRunnerToken(''); else setDraft(null); setConfirm(''); await refresh(); setNotice(`${kind === 'runner' ? 'Runner' : 'Mandate'} revoked. Work already claimed requires reconciliation in your local runner.`); });
  }
  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    await perform('prepare', async () => {
      const price = toAtomic(String(fields.get('unitPrice')), 8); if (price < 1) throw new Error('The data quote cap must be at least one tinybar.');
      const expiryHours = Number(fields.get('expiryHours'));
      if (!Number.isFinite(expiryHours) || expiryHours <= 0 || expiryHours > 24) throw new Error('Choose an expiry within the next 24 hours.');
      if (!verificationServiceId) throw new Error('Select a published verification service before reviewing the mandate.');
      const response = await api<{ mandate: MandateFields; message: string }>(`${base}/mandate`, { method: 'POST', body: JSON.stringify({ phase: 'prepare', repos: parseRepos(repos), maxDataUnitPriceAtomic: price, maxRuns, expiresAt: new Date(Date.now() + expiryHours * 3600000).toISOString(), verificationServiceId }) });
      setDraft({ ...response.mandate, message: response.message });
    });
  }
  async function approve() {
    if (!draft) return;
    await perform('approve', async () => {
      const wallet = wallets.find(item => item.info.uuid === walletId) || wallets[0];
      if (!wallet) throw new Error('Open this page in your wallet browser or enable an EVM wallet extension.');
      const signature = await signOwnerMessage(wallet, owner, draft.message);
      await api(`${base}/mandate`, { method: 'POST', body: JSON.stringify({ phase: 'approve', mandateId: draft.id, signature }) });
      setDraft(null); await refresh(); setNotice('Spending mandate approved. The paired runner will independently check the signed limits.');
    });
  }
  async function queue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform('queue', async () => {
      const body = JSON.stringify({ repos: parseRepos(repos) });
      if (!requestRef.current || requestRef.current.body !== body) requestRef.current = { key: crypto.randomUUID(), body };
      setRetry(true);
      const result = await api<{ run: Job }>(`${base}/runs`, { method: 'POST', headers: { 'Idempotency-Key': requestRef.current.key }, body });
      setRuns(current => [result.run, ...current.filter(item => item.id !== result.run.id)]); setView('run');
      requestRef.current = null; setRetry(false); setNotice('Job queued. Your paired runner will claim it when available.');
      await refresh().catch(() => setNotice('Job queued successfully. Refresh status to check its progress.'));
    });
  }

  return <section className={`${s.execution} ${w.execution}`} aria-label={`Setup and runs for ${agent.name}`}>
    <div className={s.sectionHeading}><div><h3>Agent workspace</h3><p>{ready ? 'Runner online · Signed scope available' : 'Complete the setup below to queue testnet work.'}</p></div><button className={s.secondary} onClick={() => perform('refresh', () => refresh())} disabled={!!busy}>{busy === 'refresh' ? 'Refreshing…' : 'Refresh status'}</button></div>
    {error && <p className={s.error} role="alert">{error}</p>}{notice && <p className={s.notice} role="status">{notice}</p>}{loading ? <p role="status">Loading runner, mandate, and jobs…</p> : <>
      {termsChanged && <div className={w.priceAlert} role="status"><div><h4>{priceState.state === 'unavailable' ? 'Your signed service is unavailable' : 'Your signed service terms changed'}</h4><p>{priceState.state === 'changed' ? `Signed price: ${fromAtomic(priceState.signed.priceAtomic,6)} USDC. Current price: ${fromAtomic(priceState.current.priceAtomic,6)} USDC (${priceChangeLabel(priceState.signed.priceAtomic,priceState.current.priceAtomic).toLowerCase()}).` : 'This listing is paused or no longer available in the active catalog.'} Existing authorization does not cover the current terms.</p><p>Choose an available verifier and sign a new mandate. Work already started must be reconciled before another run.</p></div><button className={s.secondary} onClick={() => setView('mandate')}>Review current terms</button></div>}
      <div className={w.steps} role="group" aria-label="Agent tasks">
        <button type="button" aria-pressed={activeView === 'runner'} onClick={() => setView('runner')}><span>1. Connect runner</span><small>{runnerOnline ? 'Online' : runnerActive ? 'Check connection' : 'Not paired'}</small></button>
        <button type="button" aria-pressed={activeView === 'mandate'} onClick={() => setView('mandate')}><span>2. Authorize spending</span><small>{mandateActive ? 'Signed scope available' : 'Review & sign'}</small></button>
        <button type="button" aria-pressed={activeView === 'run'} onClick={() => setView('run')}><span>3. Run research</span><small>{ready ? 'Ready to queue' : 'Setup required'}</small></button>
      </div>
      <div className={w.setupPanel} hidden={activeView === 'run'}><section hidden={activeView !== 'runner'}><div className={s.setupHeading}><h4>Your isolated runner</h4><span className={s.tag}>{runnerOnline ? 'Online' : runnerActive ? runner?.lastSeenAt ? 'Offline' : 'Awaiting first heartbeat' : 'Not paired'}</span></div><p>One process, one agent, your own testnet broker. The platform receives no wallet keys or broker secrets.</p>{runner?.lastSeenAt && <p className={s.caption}>Last heartbeat {dateLabel(runner.lastSeenAt)}</p>}
        {!runnerActive ? <button className={s.primary} disabled={!!busy} onClick={pair}>{busy === 'pair' ? 'Pairing…' : 'Pair a runner ↗'}</button> : <div className={s.actions}><code>{runner?.prefix}…</code><button className={s.textButton} disabled={!!busy} onClick={() => setConfirm('runner')}>Revoke runner</button></div>}
        {confirm === 'runner' && <div className={s.notice}><p>Revoke this runner’s access? It will no longer claim jobs. Reconcile any already-started work locally.</p><div className={s.actions}><button className={s.dangerButton} onClick={() => revoke('runner')} disabled={!!busy}>Confirm runner revocation</button><button className={s.textButton} onClick={() => setConfirm('')} disabled={!!busy}>Cancel</button></div></div>}
        {runnerToken && <div className={s.tokenPanel}><h4>Save the runner credential</h4><p>Shown once. Paste it into a private local file using your editor. Keep it out of commands, URLs, source control, and browser storage.</p><textarea ref={tokenRef} aria-label="One-time runner credential" value={runnerToken} readOnly rows={3} onFocus={e => e.currentTarget.select()} /><button className={s.textButton} onClick={() => setRunnerToken('')}>I saved it · Hide runner secret</button></div>}
        <details className={s.runnerInstructions} open={!!runnerToken}><summary>Local runner configuration</summary><p>Create <code>.env.runner</code> with these public pins and a path to the private token file. The file contains only the runner token. Use directory permissions 0700 and token-file permissions 0600; the runner rejects shared-readable token files.</p><pre>{`RUNNER_PLATFORM_URL=${origin}\nRUNNER_AGENT_ID=${agent.id}\nRUNNER_OWNER_ADDRESS=${owner}\nRUNNER_TOKEN_FILE=/absolute/private/path/runner-token\nRUNNER_DATA_DIR=/absolute/private/path/runner-journal`}</pre><p>In a dedicated checkout and isolated OS user environment, configure your own loopback broker in <code>.env.broker</code>, then run:</p><pre>npm run agent:runner</pre><p>This command loads <code>.env.broker</code> and <code>.env.runner</code>. Separate folders alone do not isolate OS keychains.</p><Link href="/app/developers#runner" className={s.textLink}>Runner setup and reconciliation ↗</Link></details>
      </section><section hidden={activeView !== 'mandate'}><div className={s.setupHeading}><h4>Spending authorization</h4><span className={s.tag}>{mandateActive ? 'Signed scope available' : mandate?.revokedAt ? 'Revoked' : mandate?.approvedAt ? Date.parse(mandate.expiresAt) <= now ? 'Expired' : 'Allowance used' : 'Signature required'}</span></div><p>Authorize specific repositories and a bounded number of runs. This signature permits spending within the displayed limits.</p>
      {mandate?.approvedAt && <div className={s.mandateSummary}><p><strong>{mandate.reservedRuns} / {mandate.maxRuns} run slots reserved</strong></p><p>Expires {dateLabel(mandate.expiresAt)}</p><p>{mandate.repos.join(', ')}</p><details><summary>Inspect signed scope</summary><pre>{mandate.message}</pre></details>{!mandate.revokedAt && <button className={s.textButton} onClick={() => setConfirm('mandate')} disabled={!!busy}>Revoke mandate</button>}</div>}
      {confirm === 'mandate' && <div className={s.notice}><p>Revoke future work under this mandate? Already-started work may require local reconciliation.</p><div className={s.actions}><button className={s.dangerButton} onClick={() => revoke('mandate')} disabled={!!busy}>Confirm mandate revocation</button><button className={s.textButton} onClick={() => setConfirm('')} disabled={!!busy}>Cancel</button></div></div>}
      <form onSubmit={prepare} className={s.mandateForm}>{mandate?.approvedAt && <p className={s.caption}>Prepare a replacement scope below. Signing it replaces the existing mandate for future work.</p>}<label>Allowed repositories<textarea value={repos} onChange={e => { setRepos(e.target.value); setDraft(null); }} rows={3} placeholder={'hedera/hedera-sdk-js\nethereum/go-ethereum'} required disabled={!!busy} /><small>1–3 unique repositories, one owner/repository per line.</small></label><fieldset className={s.servicePicker}><legend>Verification service</legend>{servicesLoading ? <p role="status">Loading published verifiers…</p> : services.length === 0 ? <div className={s.notice}><strong>No verifier is available</strong><p>A new mandate requires an active, published seller. <Link href="/app/marketplace">Open the marketplace ↗</Link></p></div> : services.map(service => <label key={service.id} className={verificationServiceId === service.id ? s.serviceChoiceActive : s.serviceChoice}><input type="radio" name="verificationServiceId" value={service.id} checked={verificationServiceId === service.id} onChange={() => { setVerificationServiceId(service.id); setDraft(null); }} disabled={!!busy || service.priceAtomic > agent.verificationBudgetAtomic} /><span><strong>{service.name}</strong><small>{fromAtomic(service.priceAtomic, 6)} test USDC · revision {service.revision}<br /><code>{service.recipient}</code>{service.priceAtomic > agent.verificationBudgetAtomic && ' · Above this agent’s verification budget'}</small></span></label>)}</fieldset><div className={s.formGrid}><label>Data quote cap · HBAR / repository<input name="unitPrice" inputMode="decimal" defaultValue="0.0012" required disabled={!!busy} onChange={() => setDraft(null)} /></label><label>Maximum runs<input name="maxRuns" type="number" min={1} max={10} step={1} value={maxRuns} onChange={e => { setMaxRuns(Number(e.target.value)); setDraft(null); }} required disabled={!!busy} /></label><label>Expires in<select name="expiryHours" defaultValue="1" onChange={() => setDraft(null)} disabled={!!busy}><option value="1">1 hour</option><option value="4">4 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></select></label></div><p className={s.allowanceTotal}>Maximum total allowance<br /><strong>{fromAtomic(agent.dataBudgetAtomic * maxRuns, 8)} HBAR + {fromAtomic(agent.verificationBudgetAtomic * maxRuns, 6)} test USDC</strong><small>Budget is an authorization ceiling, not deposited funds. Your local broker must hold enough testnet assets for each run.</small></p><button className={s.secondary} disabled={!!busy || servicesLoading || !verificationServiceId} type="submit">{busy === 'prepare' ? 'Preparing…' : 'Review spending mandate'}</button></form>
      {draft && <div className={s.mandateDraft}><h4>Review exact seller terms</h4>{draft.verificationService && <div className={s.signedService}><p><strong>{draft.verificationService.name}</strong> · revision {draft.verificationService.revision}</p><p>{fromAtomic(draft.verificationService.priceAtomic, 6)} test USDC per run</p><p>Recipient <code>{draft.verificationService.recipient}</code></p><p className={s.caption}>Order endpoint <code>{draft.verificationService.endpoint}</code></p>{'providerEndpoint' in draft.verificationService && <p className={s.caption}>Seller endpoint <code>{draft.verificationService.providerEndpoint}</code>. This provider receives your report and purchased evidence after payment.</p>}</div>}<p>Maximum authorized: <strong>{fromAtomic(draft.dataBudgetAtomic * draft.maxRuns, 8)} HBAR + {fromAtomic(draft.verificationBudgetAtomic * draft.maxRuns, 6)} test USDC</strong>. This authorizes spending; it is separate from sign-in and does not fund the runner.</p><pre>{draft.message}</pre>{wallets.length ? <label>Signing wallet<select value={walletId || wallets[0].info.uuid} onChange={e => setWalletId(e.target.value)} disabled={!!busy}>{wallets.map(wallet => <option key={wallet.info.uuid} value={wallet.info.uuid}>{wallet.info.name}</option>)}</select></label> : <p>Enable an EVM wallet extension or open this page in your wallet browser to sign.</p>}<p className={s.caption}>Required owner: <code>{owner}</code></p><button className={s.primary} onClick={approve} disabled={!!busy || !wallets.length || !draft.verificationService}>{busy === 'approve' ? 'Review your wallet…' : 'Sign spending mandate ↗'}</button></div>}
      </section></div>
      <section className={s.jobs} hidden={activeView !== 'run'}><div className={s.sectionHeading}><div><h3>Research jobs</h3><p>Run within the signed repository scope. Results are supplied by your paired runner.</p></div><span className={s.tag}>{ready ? 'Ready to queue' : 'Setup required'}</span></div><form onSubmit={queue} className={s.runForm}><label>Repositories for this run<textarea aria-label="Repositories for this run" rows={2} value={repos} onChange={e => { setRepos(e.target.value); setDraft(null); setRetry(false); }} disabled={!!busy} placeholder="hedera/hedera-sdk-js" required /></label><button className={s.primary} type="submit" disabled={!!busy || termsChanged || (!ready && !retry)}>{busy === 'queue' ? 'Queuing…' : retry ? 'Retry same run request' : 'Queue testnet run ↗'}</button></form>{!ready && <p className={s.caption}>Requires a recent runner heartbeat and an unexpired, signed mandate with remaining run slots.</p>}{retry && <p className={s.notice}>If the request failed after reaching the server, retry it with the same repositories. The same idempotency key prevents a duplicate job.</p>}
      <div className={w.historyHeading}><h4>Recent runs</h4><Link href="/app/evidence">View all execution evidence</Link></div>
      {!runs.length ? <p className={s.jobsEmpty}>No jobs yet. Your agent’s real runs will appear here.</p> : <div className={s.jobList}>{runs.slice(0, 3).map(run => <JobResult key={run.id} job={run} />)}</div>}
      </section>
    </>}
    <div className={w.related}><span>Connect this agent to your application</span><Link href="/app/developers">Manage API credentials</Link></div>
  </section>;
}

export function JobResult({ job }: { job: Job }) {
  const result = job.result;
  return <details className={s.jobResult} open={activeStatus(job.status)}><summary><span><strong>{job.repos.join(', ')}</strong><small>{dateLabel(job.createdAt)} · {job.id}</small>{result && <small>{result.receipts?.length || 0} receipts · {result.report?.checks?.filter(check => check.passed).length || 0}/{result.report?.checks?.length || 0} checks passed{job.receiptVerification === 'chain-confirmed' ? ' · Chain confirmed' : ''}</small>}</span><span className={s.tag}>{job.status.replaceAll('_', ' ')}</span></summary><div className={s.jobBody}>
    {(job.error || result?.error) && <p className={s.error}>{job.error || result?.error}</p>}
    {job.status === 'uncertain' && <p className={s.notice}>Execution was interrupted. Check the runner’s durable journal and broker receipts before any manual reconciliation. This job is not automatically retried.</p>}
    {!result && <p className={s.caption}>{activeStatus(job.status) ? 'Waiting for the runner’s result. Active jobs refresh every five seconds while this page is visible.' : 'No execution result has been uploaded.'}</p>}
    {result?.approval?.reason && <p className={s.notice}>Blocked: {result.approval.reason}. Approve a new scoped mandate only after reviewing the changed price and reconciling prior payments.</p>}
    {result?.report && <section><h4>{result.report.title}</h4><p className={s.reportText}>{result.report.summary}</p><p className={s.reportText}>{result.report.recommendation}</p><p className={s.caption}>Generated by {result.report.generatedBy} · {result.mandate.verificationService ? 'Provider-reported checks; chain confirmation covers payment, not report accuracy' : 'Runner-reported checks'}</p><details className={w.evidenceDetail}><summary>Claim checks ({result.report.checks?.length || 0})</summary>{result.report.checks?.map((check, index) => <div className={s.sourceCheck} key={index}><strong>{check.passed ? 'Passed' : 'Failed'} · {check.label}</strong><p>{check.detail}</p></div>)}</details></section>}
    {!!result?.evidence?.length && <details className={w.evidenceDetail}><summary>Purchased evidence ({result.evidence.length})</summary>{result.evidence.map((item, index) => <div className={s.sourceCheck} key={index}><strong>{item.repo}</strong><p>{item.description}</p><p>{item.stars} stars · {item.forks} forks · {item.openIssues} open issues</p><p className={s.caption}>Fetched {dateLabel(item.fetchedAt)} · Source: <code>{item.sourceUrl}</code></p></div>)}</details>}
    {!!result?.receipts?.length && <section><h4>Payment receipts</h4><p className={s.caption}>{job.receiptVerification === 'chain-confirmed' ? 'Chain-confirmed by the platform against the bound job and marketplace order.' : 'Runner-confirmed records. Independent chain verification has not been performed by this workspace.'}</p>{result.mandate.verificationService && <div className={s.signedService}><p><strong>Seller: {result.mandate.verificationService.name}</strong> · revision {result.mandate.verificationService.revision}</p><p>{fromAtomic(result.mandate.verificationService.priceAtomic, 6)} test USDC · recipient <code>{result.mandate.verificationService.recipient}</code></p></div>}{result.receipts.map((receipt, index) => { const explorer = safeExplorerUrl(receipt.explorerUrl); return <div className={s.receiptRow} key={index}><div><strong>{fromAtomic(receipt.amountAtomic, receipt.asset === 'HBAR' ? 8 : 6)} {receipt.asset}</strong><p>{receipt.network} · {receipt.provider}</p><p className={s.caption}>{receipt.mode === 'rehearsal' || receipt.status === 'simulated' ? 'Simulated · Not a payment' : job.receiptVerification === 'chain-confirmed' ? 'Chain confirmed' : 'Runner-confirmed'} · {dateLabel(receipt.timestamp)}</p>{receipt.orderId && <p>Order <code>{receipt.orderId}</code></p>}{receipt.recipient && <p>Recipient <code>{receipt.recipient}</code></p>}{receipt.transactionId && <code>{receipt.transactionId}</code>}</div>{explorer && <a className={s.textLink} href={explorer} target="_blank" rel="noopener noreferrer">View explorer ↗</a>}</div>; })}</section>}
    {!!result?.events?.length && <details className={w.evidenceDetail}><summary>Execution activity ({result.events.length})</summary><ol className={s.eventList}>{result.events.map((event, index) => <li key={index}><strong>{event.title}</strong><p>{event.detail}</p><small>{event.actor} · {dateLabel(event.timestamp)}</small></li>)}</ol></details>}
  </div></details>;
}
