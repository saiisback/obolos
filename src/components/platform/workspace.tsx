'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, errorMessage, fromAtomic, toAtomic, type Agent, type User } from './api';
import s from './platform.module.css';
import { AgentExecution } from './agent-execution';
import { Credentials } from './agent-credentials';

export function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true); setError('');
    try {
      const account = await api<{ user: User | null; configured: boolean }>('/api/account', {signal});
      if (signal?.aborted) return;
      setConfigured(account.configured);
      if (!account.configured) return;
      if (!account.user) { router.replace('/login'); return; }
      setUser(account.user);
      const result = await api<{ agents: Agent[] }>('/api/agents', {signal});
      if (signal?.aborted) return;
      setAgents(result.agents);
    } catch (e) { if (signal?.aborted) return; if (e instanceof ApiError && e.status === 401) router.replace('/login'); else setError(errorMessage(e)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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

  return <main id="main" className={s.main}>
    <div className={s.workspaceHeading}><div><p className={s.eyebrow}>Your workspace · Testnet</p><h1>Agents, within limits.</h1><p>Define the work. Set the allowance. Control access.</p></div></div>
    {loading ? <div className={s.empty} role="status">Loading your workspace…</div> : !configured ? <div className={s.empty}><h2>Account service needs setup</h2><p>This deployment needs a database and sign-in configuration before your workspace is available.</p><button className={s.secondary} onClick={() => void load()}>Check again</button></div> : <>
      {error && <div className={s.error} role="alert"><p>{error}</p>{!creating && <button className={s.secondary} onClick={() => void load()}>Retry</button>}</div>}
      {user && <><div className={s.notice}><strong>Your keys stay with your runner</strong><p>Pair your own isolated runner and approve a scoped spending mandate before queuing work. Your wallet and broker credentials stay local. <Link href="/app/developers#runner">See prerequisites ↗</Link></p></div>
      <section aria-labelledby="agents-heading"><div className={s.sectionHeading}><div><h2 id="agents-heading">Your agents <span className={s.count}>{agents.length}</span></h2><p>Owned by your signed-in wallet.</p></div><button ref={createRef} className={s.primary} onClick={() => setCreating(true)} disabled={creating}>Create agent <span aria-hidden="true">+</span></button></div>
      {creating && <form onSubmit={createAgent} className={s.agentForm}><div className={s.sectionHeading}><h3>New research agent</h3><button type="button" className={s.textButton} disabled={saving} onClick={() => { setCreating(false); setError(''); createRef.current?.focus(); }}>Cancel</button></div><div className={s.formGrid}><label>Agent name<input ref={nameRef} name="name" required maxLength={80} placeholder="Protocol researcher" disabled={saving} /></label><label className={s.fullWidth}>Description<textarea name="description" maxLength={1000} rows={2} placeholder="What will this agent research?" disabled={saving} /></label><label>Data budget · HBAR per run<input name="dataBudget" required inputMode="decimal" defaultValue="0.1" aria-describedby="data-budget-hint" disabled={saving} /><small id="data-budget-hint">0–1 HBAR · Up to 8 decimal places</small></label><label>Verification budget · USDC per run<input name="verificationBudget" required inputMode="decimal" defaultValue="0.1" aria-describedby="verification-budget-hint" disabled={saving} /><small id="verification-budget-hint">0–1 test USDC · Up to 6 decimal places</small></label></div><div className={s.formFooter}><p>These are configuration limits. No funds will move.</p><button className={s.primary} disabled={saving} type="submit">{saving ? 'Creating agent…' : 'Create agent ↗'}</button></div></form>}
      {agents.length === 0 ? <div className={s.empty}><span className={s.emptySymbol} aria-hidden="true">↗</span><h3>Your first agent starts here.</h3><p>Give it a name, set its separate spending limits, and create a credential for your integration.</p>{!creating && <button className={s.secondary} onClick={() => setCreating(true)}>Create your first agent</button>}</div> : <div className={s.agentList}>{agents.map(agent => <article key={agent.id} className={s.agent}><div className={s.agentOverview}><div className={s.agentName}><h3>{agent.name}</h3><p>{agent.description || 'No description provided.'}</p><code>{agent.id}</code></div><div className={s.agentBudget}><span>Data / run</span><strong>{fromAtomic(agent.dataBudgetAtomic, 8)} HBAR</strong></div><div className={s.agentBudget}><span>Verification / run</span><strong>{fromAtomic(agent.verificationBudgetAtomic, 6)} USDC</strong></div><div className={s.agentAction}><span className={s.tag}>Testnet agent</span><button className={s.secondary} aria-expanded={selected === agent.id} aria-controls={`agent-setup-${agent.id}`} onClick={() => setSelected(selected === agent.id ? null : agent.id)}>{selected === agent.id ? 'Close agent' : 'Manage agent'}</button></div></div>{selected === agent.id && <div id={`agent-setup-${agent.id}`}><AgentExecution agent={agent} owner={user.address} /><Credentials key={agent.id} agent={agent} /></div>}</article>)}</div>}</section></>}
    </>}
  </main>;
}
