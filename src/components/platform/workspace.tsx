'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, errorMessage, fromAtomic, toAtomic, type Agent, type ApiKeySummary, type User } from './api';
import s from './platform.module.css';

export function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);

  async function load() {
    setLoading(true); setError('');
    try {
      const account = await api<{ user: User | null; configured: boolean }>('/api/account');
      setConfigured(account.configured);
      if (!account.configured) return;
      if (!account.user) { router.replace('/login'); return; }
      setUser(account.user);
      const result = await api<{ agents: Agent[] }>('/api/agents');
      setAgents(result.agents);
    } catch (e) { if (e instanceof ApiError && e.status === 401) router.replace('/login'); else setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (creating) nameRef.current?.focus(); }, [creating]);

  async function createAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setSaving(true); setError('');
    try {
      const result = await api<{ agent: Agent }>('/api/agents', { method: 'POST', body: JSON.stringify({ name: String(data.get('name')).trim(), description: String(data.get('description')).trim(), dataBudgetAtomic: toAtomic(String(data.get('dataBudget')), 8), verificationBudgetAtomic: toAtomic(String(data.get('verificationBudget')), 6) }) });
      setAgents(current => [result.agent, ...current]); setCreating(false); setSelected(result.agent.id);
      createRef.current?.focus();
    } catch (e) { if (e instanceof ApiError && e.status === 401) router.replace('/login'); else setError(errorMessage(e)); }
    finally { setSaving(false); }
  }
  async function logout() {
    setLogoutBusy(true); setError('');
    try { await api('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }
    catch (e) { setError(errorMessage(e)); setLogoutBusy(false); }
  }

  return <main id="main" className={s.main}>
    <div className={s.workspaceHeading}><div><p className={s.eyebrow}>Your workspace · Testnet</p><h1>Agents, within limits.</h1><p>Define the work. Set the allowance. Control access.</p></div>{user && <div className={s.account}><span title={user.address}>{user.address.slice(0, 6)}…{user.address.slice(-4)}</span><button className={s.textButton} onClick={logout} disabled={logoutBusy}>{logoutBusy ? 'Signing out…' : 'Sign out'}</button></div>}</div>
    {loading ? <div className={s.empty} role="status">Loading your workspace…</div> : !configured ? <div className={s.empty}><h2>Account service needs setup</h2><p>This deployment needs a database and sign-in configuration before your workspace is available.</p><button className={s.secondary} onClick={load}>Check again</button></div> : <>
      {error && <div className={s.error} role="alert"><p>{error}</p>{!creating && <button className={s.secondary} onClick={load}>Retry</button>}</div>}
      {user && <><div className={s.notice}><strong>Payment execution requires setup</strong><p>You can create agents and API credentials now. Agents cannot spend or run research until isolated payment execution and signed mandates are available. <Link href="/developers#runner">See prerequisites ↗</Link></p></div>
      <section aria-labelledby="agents-heading"><div className={s.sectionHeading}><div><h2 id="agents-heading">Your agents <span className={s.count}>{agents.length}</span></h2><p>Owned by your signed-in wallet.</p></div><button ref={createRef} className={s.primary} onClick={() => setCreating(true)} disabled={creating}>Create agent <span aria-hidden="true">+</span></button></div>
      {creating && <form onSubmit={createAgent} className={s.agentForm}><div className={s.sectionHeading}><h3>New research agent</h3><button type="button" className={s.textButton} disabled={saving} onClick={() => { setCreating(false); setError(''); createRef.current?.focus(); }}>Cancel</button></div><div className={s.formGrid}><label>Agent name<input ref={nameRef} name="name" required maxLength={80} placeholder="Protocol researcher" disabled={saving} /></label><label className={s.fullWidth}>Description<textarea name="description" maxLength={1000} rows={2} placeholder="What will this agent research?" disabled={saving} /></label><label>Data budget · HBAR per run<input name="dataBudget" required inputMode="decimal" defaultValue="0.1" aria-describedby="data-budget-hint" disabled={saving} /><small id="data-budget-hint">0–1 HBAR · Up to 8 decimal places</small></label><label>Verification budget · USDC per run<input name="verificationBudget" required inputMode="decimal" defaultValue="0.1" aria-describedby="verification-budget-hint" disabled={saving} /><small id="verification-budget-hint">0–1 test USDC · Up to 6 decimal places</small></label></div><div className={s.formFooter}><p>These are configuration limits. No funds will move.</p><button className={s.primary} disabled={saving} type="submit">{saving ? 'Creating agent…' : 'Create agent ↗'}</button></div></form>}
      {agents.length === 0 ? <div className={s.empty}><span className={s.emptySymbol} aria-hidden="true">↗</span><h3>Your first agent starts here.</h3><p>Give it a name, set its separate spending limits, and create a credential for your integration.</p>{!creating && <button className={s.secondary} onClick={() => setCreating(true)}>Create your first agent</button>}</div> : <div className={s.agentList}>{agents.map(agent => <article key={agent.id} className={s.agent}><div className={s.agentOverview}><div className={s.agentName}><h3>{agent.name}</h3><p>{agent.description || 'No description provided.'}</p><code>{agent.id}</code></div><div className={s.agentBudget}><span>Data / run</span><strong>{fromAtomic(agent.dataBudgetAtomic, 8)} HBAR</strong></div><div className={s.agentBudget}><span>Verification / run</span><strong>{fromAtomic(agent.verificationBudgetAtomic, 6)} USDC</strong></div><div className={s.agentAction}><span className={s.tag}>{agent.status === 'setup_required' ? 'Setup required' : agent.status.replaceAll('_', ' ')}</span><button className={s.secondary} aria-expanded={selected === agent.id} aria-controls={`keys-${agent.id}`} onClick={() => setSelected(selected === agent.id ? null : agent.id)}>{selected === agent.id ? 'Close credentials' : 'API credentials'}</button></div></div>{selected === agent.id && <Credentials key={agent.id} agent={agent} />}</article>)}</div>}</section></>}
    </>}
  </main>;
}

function Credentials({ agent }: { agent: Agent }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const tokenRef = useRef<HTMLTextAreaElement>(null);
  async function load() {
    setLoading(true); setError('');
    try { const result = await api<{ keys: ApiKeySummary[] }>(`/api/agents/${agent.id}/keys`); setKeys(result.keys); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) tokenRef.current?.focus(); }, [token]);
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get('name')).trim();
    setBusy(true); setError('');
    try { const result = await api<{ key: ApiKeySummary; token: string }>(`/api/agents/${agent.id}/keys`, { method: 'POST', body: JSON.stringify({ name }) }); setKeys(current => [result.key, ...current]); setToken(result.token); setCopied(false); form.reset(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try { await api(`/api/agents/${agent.id}/keys/${id}`, { method: 'DELETE' }); setKeys(current => current.map(key => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key)); setConfirmRevoke(null); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setError('Clipboard access is unavailable. Select and copy the credential below.'); tokenRef.current?.select(); } }
  return <section id={`keys-${agent.id}`} className={s.credentials} aria-label={`API credentials for ${agent.name}`}><h3>Agent API credentials</h3><p>Each credential is scoped to this agent and expires after 30 days. Keep it on your server.</p>{error && <div role="alert" className={s.error}>{error}<button onClick={load} className={s.textButton} disabled={busy}>Reload credentials</button></div>}
    {token && <div className={s.tokenPanel}><h3>Copy your credential now</h3><p>This secret is shown only once. Closing these credentials or leaving the page hides it permanently.</p><textarea ref={tokenRef} readOnly value={token} aria-label="New API credential" rows={2} onFocus={event => event.target.select()} /><div className={s.actions}><button className={s.secondary} onClick={copy}>{copied ? 'Copied' : 'Copy credential'}</button><button className={s.textButton} onClick={() => setToken('')}>I saved it · Hide secret</button><span role="status">{copied ? 'Credential copied to clipboard.' : ''}</span></div></div>}
    <form onSubmit={issue} className={s.keyForm}><label htmlFor={`key-name-${agent.id}`}>Credential name<input id={`key-name-${agent.id}`} name="name" required maxLength={80} placeholder="Local development" disabled={busy || !!token} /></label><button className={s.primary} type="submit" disabled={busy || loading || !!token}>{busy ? 'Saving…' : 'Issue credential ↗'}</button></form>
    {loading ? <p role="status">Loading credentials…</p> : keys.length === 0 ? <p className={s.caption}>No credentials yet. Issue one when you’re ready to integrate.</p> : <ul className={s.keyList}>{keys.map(key => { const expired = new Date(key.expiresAt).getTime() <= Date.now(); return <li key={key.id}><div><strong>{key.name}</strong><code>{key.prefix}…</code><small>{key.revokedAt ? 'Revoked' : expired ? 'Expired' : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}</small></div>{!key.revokedAt && !expired && (confirmRevoke === key.id ? <div className={s.revokeConfirm}><span>Revoke immediately?</span><button className={s.dangerButton} onClick={() => revoke(key.id)} disabled={busy}>Revoke</button><button className={s.textButton} onClick={() => setConfirmRevoke(null)} disabled={busy}>Cancel</button></div> : <button className={s.textButton} onClick={() => setConfirmRevoke(key.id)} disabled={busy}>Revoke</button>)}</li>; })}</ul>}
    <Link className={s.textLink} href="/developers">Use this credential in your integration ↗</Link>
  </section>;
}
