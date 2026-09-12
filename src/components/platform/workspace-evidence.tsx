'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {api, errorMessage, type Agent} from './api';
import {JobResult, type Job} from './agent-execution';
import {AgentEconomy} from './agent-economy';
import {WorkspaceGlyph} from './workspace-glyph';
import s from './platform.module.css';
import e from './workspace-evidence.module.css';

function ResearchHistory({agentId}: {agentId: string}) {
  const [runs, setRuns] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    let active = false;
    setLoading(true); setError('');
    async function refresh() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const data = await api<{runs: Job[]}>(`/api/agents/${agentId}/runs`, {signal: controller.signal});
        if (controller.signal.aborted) return;
        setRuns(data.runs); active = data.runs.some(run => ['queued', 'running'].includes(run.status)); setError('');
      } catch (caught) { if (!controller.signal.aborted) setError(errorMessage(caught)); }
      finally { if (!controller.signal.aborted) setLoading(false); inFlight = false; }
    }
    void refresh();
    const timer = setInterval(() => { if (active && !document.hidden) void refresh(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [agentId, attempt]);

  const visible = runs.filter(run => filter === 'all' || (filter === 'receipts' ? !!run.result?.receipts?.length : ['blocked', 'failed', 'uncertain'].includes(run.status)));
  return <section className={e.research} aria-label="Repository research history">
    <div className={s.sectionHeading}><div><h2>Repository research</h2><p>Reports and receipts from the repository research runner.</p></div><label className={e.filter}>Show research<select aria-label="Show research" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All runs</option><option value="receipts">Runs with receipts</option><option value="attention">Needs attention</option></select></label></div>
    {error && <div className={s.error} role="alert">{error}<button className={s.secondary} disabled={loading} onClick={() => setAttempt(value => value + 1)}>Retry research</button></div>}
    {loading && !runs.length ? <p className={s.empty} role="status">Loading repository research…</p> : <>
      {!!runs.length && <p className={s.caption}>Latest {runs.length} research runs (up to 100). Queued and running jobs refresh every five seconds while this page is visible.</p>}
      {!runs.length ? !error && <div className={e.empty}><h3>No repository research runs yet</h3><p>Resource orders appear above. This agent has not queued a repository research run.</p><Link className={s.textLink} href="/app">Open your agents ↗</Link></div> : !visible.length ? <div className={e.empty}><h3>No research runs match this filter</h3><button className={s.secondary} onClick={() => setFilter('all')}>Show all runs</button></div> : <div className={e.results}>{visible.map(run => <JobResult key={run.id} job={run} />)}</div>}
    </>}
  </section>;
}

export function WorkspaceEvidence() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

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

  return <main id="main" className={`${s.main} ${e.page}`}>
    <header className={e.heading}><div><h1>Your execution evidence</h1><p>Resource outputs, payment receipts, and research reports from your agents.</p></div><WorkspaceGlyph kind="evidence" /></header>
    {error && <div className={s.error} role="alert">{error}<button className={s.secondary} onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
    {loadingAgents ? <p className={s.empty} role="status">Loading your agents…</p> : !agents.length ? !error && <div className={s.empty}><h2>No agents yet</h2><p>Create an agent and complete a run to see your own execution evidence here.</p><Link className={s.primary} href="/app">Open your agents</Link></div> : <>
      <div className={e.toolbar}><label>Agent<select aria-label="Agent" value={agentId} onChange={event => setAgentId(event.target.value)}>{agents.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className={s.secondary} aria-label="Refresh evidence" onClick={() => setAttempt(value => value + 1)}>Refresh all</button></div>
      <div key={agentId} className={e.sources}>
        <AgentEconomy agentId={agentId} showPolicy={false} />
        <ResearchHistory agentId={agentId} />
      </div>
    </>}
  </main>;
}
