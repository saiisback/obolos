'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {api, errorMessage, type Agent} from './api';
import {JobResult, type Job} from './agent-execution';
import s from './platform.module.css';
import e from './workspace-evidence.module.css';

export function WorkspaceEvidence() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [runs, setRuns] = useState<Job[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingAgents(true); setError('');
    void api<{agents: Agent[]}>('/api/agents', {signal: controller.signal}).then(data => {
      if (controller.signal.aborted) return;
      setAgents(data.agents);
      setAgentId(previous => data.agents.some(agent => agent.id === previous) ? previous : data.agents[0]?.id || '');
    }).catch(caught => { if (!controller.signal.aborted) setError(errorMessage(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoadingAgents(false); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!agentId) return;
    const controller = new AbortController();
    let inFlight = false;
    setRuns([]); setLoadingRuns(true); setError(''); active.current = false;
    async function refresh() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const data = await api<{runs: Job[]}>(`/api/agents/${agentId}/runs`, {signal: controller.signal});
        if (controller.signal.aborted) return;
        setRuns(data.runs); active.current = data.runs.some(run => ['queued', 'running'].includes(run.status)); setError('');
      } catch (caught) { if (!controller.signal.aborted) setError(errorMessage(caught)); }
      finally { if (!controller.signal.aborted) setLoadingRuns(false); inFlight = false; }
    }
    void refresh();
    const timer = setInterval(() => { if (active.current && !document.hidden) void refresh(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [agentId, attempt]);

  const visible = runs.filter(run => filter === 'all' || (filter === 'receipts' ? !!run.result?.receipts?.length : ['blocked', 'failed', 'uncertain'].includes(run.status)));
  const agent = agents.find(item => item.id === agentId);
  return <main id="main" className={`${s.main} ${e.page}`}>
    <header className={e.heading}><h1>Your execution evidence</h1><p>Reports, purchased data, receipts, and decisions from your agents’ actual runs.</p></header>
    {error && <div className={s.error} role="alert">{error}<button className={s.secondary} onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
    {loadingAgents ? <p className={s.empty} role="status">Loading your agents…</p> : !agents.length ? !error && <div className={s.empty}><h2>No agents yet</h2><p>Create an agent and complete a run to see your own execution evidence here.</p><Link className={s.primary} href="/app">Open your agents</Link></div> : <>
      <div className={e.toolbar}><label>Agent<select aria-label="Agent" value={agentId} onChange={event => { setAgentId(event.target.value); setFilter('all'); }}>{agents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Show<select aria-label="Show" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All runs</option><option value="receipts">Runs with receipts</option><option value="attention">Needs attention</option></select></label><button className={s.secondary} disabled={loadingRuns || loadingAgents} onClick={() => setAttempt(value => value + 1)}>Refresh evidence</button></div>
      {loadingRuns ? <p className={s.empty} role="status">Loading this agent’s evidence…</p> : <>
        <p className={s.caption}>{agent?.name} · Latest {runs.length} runs (up to 100). Queued and running jobs refresh every five seconds while this page is visible.</p>
        {!runs.length ? !error && <div className={s.empty}><h2>No execution history yet</h2><p>This agent has not queued a run. Pair its runner, approve a mandate, and start from the Agents section.</p><Link className={s.primary} href="/app">Set up your agent</Link></div> : !visible.length ? <div className={s.empty}><h2>No runs match this filter</h2><button className={s.secondary} onClick={() => setFilter('all')}>Show all runs</button></div> : <section className={e.results} aria-label="Your agent execution history">{visible.map(run => <JobResult key={run.id} job={run} />)}</section>}
      </>}
    </>}
  </main>;
}
