'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError, errorMessage, fromAtomic, toAtomic, type Agent, type User } from './api';
import s from './platform.module.css';
import { AgentExecution } from './agent-execution';
import w from './workspace-layout.module.css';

export function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preferredServiceId, setPreferredServiceId] = useState('');
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
  useEffect(() => { const id = new URLSearchParams(window.location.search).get('service'); if(id && /^[a-f0-9-]{36}$/i.test(id))setPreferredServiceId(id); }, []);
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

  const selectedAgent = agents.find(agent => agent.id === selected);
  return <main id="main" className={`${s.main} ${w.agentsPage}`}>
    <header className={w.pageHeading}><div><h1>{selectedAgent?.name || 'Your agents'}</h1><p>{selectedAgent ? selectedAgent.description || 'Connect a runner, approve spending, and queue work.' : 'Set up an agent, authorize its spending, and run repository research.'}</p></div>{selectedAgent ? <button className={s.secondary} onClick={() => setSelected(null)}>Back to agents</button> : <button ref={createRef} className={s.primary} onClick={() => setCreating(true)} disabled={creating || loading}>Create agent</button>}</header>
    {loading ? <div className={s.empty} role="status">Loading your workspace…</div> : !configured ? <div className={s.empty}><h2>Account service needs setup</h2><p>This deployment needs a database and sign-in configuration before your workspace is available.</p><button className={s.secondary} onClick={() => void load()}>Check again</button></div> : <>
      {error && <div className={s.error} role="alert"><p>{error}</p>{!creating && <button className={s.secondary} onClick={() => void load()}>Retry</button>}</div>}
      {user && <><details hidden={!!selectedAgent} className={w.setupGuide} open={agents.length === 0}><summary>Start here: from agent to paid report</summary><ol><li><strong>Create an agent</strong><span>Set separate HBAR and USDC limits.</span></li><li><strong>Connect your runner</strong><span>Pair and fund your private broker.</span></li><li><strong>Approve spending</strong><span>Choose repositories and sign exact terms.</span></li><li><strong>Run & review</strong><span>Track the report and payment receipts.</span></li></ol><Link href="/app/developers#runner">Read the runner setup guide</Link></details>
      {preferredServiceId && <p className={w.selectionHint}>Choose an agent, then open <strong>Authorize spending</strong> to review the marketplace service you selected. Your wallet signature is required before execution.</p>}
      <section aria-label="Your agent collection">
      {creating && <form onSubmit={createAgent} className={s.agentForm}><div className={s.sectionHeading}><h3>New research agent</h3><button type="button" className={s.textButton} disabled={saving} onClick={() => { setCreating(false); setError(''); createRef.current?.focus(); }}>Cancel</button></div><div className={s.formGrid}><label>Agent name<input ref={nameRef} name="name" required maxLength={80} placeholder="Protocol researcher" disabled={saving} /></label><label className={s.fullWidth}>Description<textarea name="description" maxLength={1000} rows={2} placeholder="What will this agent research?" disabled={saving} /></label><label>Data budget · HBAR per run<input name="dataBudget" required inputMode="decimal" defaultValue="0.1" aria-describedby="data-budget-hint" disabled={saving} /><small id="data-budget-hint">0–1 HBAR · Up to 8 decimal places</small></label><label>Verification budget · USDC per run<input name="verificationBudget" required inputMode="decimal" defaultValue="0.1" aria-describedby="verification-budget-hint" disabled={saving} /><small id="verification-budget-hint">0–1 test USDC · Up to 6 decimal places</small></label></div><div className={s.formFooter}><p>These are configuration limits. No funds will move.</p><button className={s.primary} disabled={saving} type="submit">{saving ? 'Creating agent…' : 'Create agent ↗'}</button></div></form>}
      {agents.length === 0 ? <div className={s.empty}><h3>Your first agent starts here.</h3><p>Give it a name, set its separate spending limits, then open its setup to connect a runner and approve spending.</p>{!creating && <button className={s.secondary} onClick={() => setCreating(true)}>Create your first agent</button>}</div> : <div className={s.agentList}>{(selectedAgent ? [selectedAgent] : agents).map(agent => <article key={agent.id} className={s.agent}><div className={`${s.agentOverview} ${selectedAgent ? w.selectedOverview : ""}`}><div className={s.agentName}><h3>{agent.name}</h3><p>{agent.description || 'No description provided.'}</p><code>{agent.id}</code></div><div className={s.agentBudget}><span>Data / run</span><strong>{fromAtomic(agent.dataBudgetAtomic, 8)} HBAR</strong></div><div className={s.agentBudget}><span>Verification / run</span><strong>{fromAtomic(agent.verificationBudgetAtomic, 6)} USDC</strong></div><div className={s.agentAction}><span className={s.tag}>Testnet agent</span><button className={s.secondary} aria-expanded={selected === agent.id} aria-controls={`agent-setup-${agent.id}`} onClick={() => setSelected(selected === agent.id ? null : agent.id)}>{selected === agent.id ? 'Close agent' : 'Manage agent'}</button></div></div>{selected === agent.id && <div id={`agent-setup-${agent.id}`}><AgentExecution key={agent.id} agent={agent} owner={user.address} preferredServiceId={preferredServiceId} /></div>}</article>)}</div>}</section></>}
    </>}
  </main>;
}
