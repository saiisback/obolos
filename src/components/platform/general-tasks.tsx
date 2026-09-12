'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import Link from 'next/link';
import {ArrowRight, RefreshCw} from 'lucide-react';
import {formatUnits, parseUnits} from 'viem';
import type {GeneralTask} from '@/lib/tasks/model';
import {api, errorMessage, type Agent} from './api';
import s from './platform.module.css';
import t from './general-tasks.module.css';

type Profile = {serviceHash: string; title: string; description: string; tags: string[]; examples: unknown[]};
const money = (value: string | bigint) => `${formatUnits(BigInt(value), 6)} test USDC`;
const labels: Record<GeneralTask['status'], string> = {queued: 'Waiting for runner', planning: 'Planning', needs_approval: 'Review your plan', approved: 'Approved · waiting for runner', running: 'Work in progress', completed: 'Completed', blocked: 'Needs attention', cancelled: 'Cancelled'};
const active = new Set(['queued', 'planning', 'approved', 'running']);

export function GeneralTasks({agents, selectedAgentId}: {agents: Agent[]; selectedAgentId?: string | null}) {
  const [agentChoice, setAgentChoice] = useState('');
  const agentId = selectedAgentId || agentChoice || agents[0]?.id || '';
  const [instruction, setInstruction] = useState('');
  const [budget, setBudget] = useState('0.1');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<GeneralTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [refresh, setRefresh] = useState(0);
  const submission = useRef<{body: string; key: string} | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void api<{profiles: Profile[]}>('/api/economy/service-profiles', {signal: controller.signal}).then(result => {
      if (controller.signal.aborted) return;
      setProfiles(result.profiles ?? []);
      const serviceHash = new URLSearchParams(window.location.search).get('taskService');
      const profile = result.profiles?.find(item => item.serviceHash === serviceHash);
      if (profile) setInstruction(current => current || `Use the ${profile.title} service (${profile.serviceHash}) to: `);
      else if (serviceHash && /^0x[\da-f]{64}$/i.test(serviceHash)) setInstruction(current => current || `Use service ${serviceHash} to: `);
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setTasks([]); setLoading(true); setError('');
    if (!agentId) {setLoading(false); return () => controller.abort();}
    async function load() {
      try {
        const result = await api<{tasks: GeneralTask[]}>(`/api/tasks?agentId=${encodeURIComponent(agentId)}`, {signal: controller.signal});
        if (controller.signal.aborted) return;
        const values = result.tasks ?? [];
        setTasks(values); setError('');
        if (values.some(task => active.has(task.status))) timer = setTimeout(() => {if (!document.hidden) void load(); else timer = setTimeout(load, 10000);}, 5000);
      } catch (caught) {if (!controller.signal.aborted) setError(errorMessage(caught));}
      finally {if (!controller.signal.aborted) setLoading(false);}
    }
    void load();
    return () => {controller.abort(); if (timer) clearTimeout(timer);};
  }, [agentId, refresh]);

  const replace = useCallback((task: GeneralTask) => setTasks(current => [task, ...current.filter(item => item.id !== task.id)]), []);
  async function create(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy('create'); setError('');
    try {
      if (!/^\d+(?:\.\d{1,6})?$/.test(budget) || parseUnits(budget, 6) <= 0n) throw Error('Enter a positive budget with up to 6 decimal places.');
      const body = JSON.stringify({agentId, instruction: instruction.trim(), budgetAtomic: parseUnits(budget, 6).toString()});
      if (submission.current?.body !== body) submission.current = {body, key: crypto.randomUUID()};
      const {task} = await api<{task: GeneralTask}>('/api/tasks', {method: 'POST', headers: {'Idempotency-Key': submission.current.key}, body});
      replace(task); setInstruction(''); submission.current = null; setRefresh(value => value + 1);
    } catch (caught) {setError(errorMessage(caught));}
    finally {setBusy('');}
  }
  async function act(task: GeneralTask, action: 'approve' | 'retry' | 'cancel') {
    if (busy) return;
    setBusy(task.id); setError('');
    try {
      replace((await api<{task: GeneralTask}>(`/api/tasks/${task.id}`, {method: 'POST', body: JSON.stringify({action, ...(action === 'approve' ? {planHash: task.planHash} : {})})})).task);
      setRefresh(value => value + 1);
    } catch (caught) {setError(errorMessage(caught));}
    finally {setBusy('');}
  }

  return <section className={t.tasks} aria-label="General tasks">
    <div className={t.heading}><div><h2>What would you like done?</h2><p>Describe the outcome. Your agent plans with published services; you review the exact cost before it spends.</p></div></div>
    <form className={t.composer} onSubmit={create}>
      <label className={t.instruction}>Your task<textarea aria-label="Your task" ref={textRef} required minLength={3} maxLength={12000} rows={4} value={instruction} onChange={event => setInstruction(event.target.value)} disabled={!!busy} placeholder="Describe the work and include the text or data the services will need."/></label>
      <div className={t.controls}><label>Agent<select value={agentId} disabled={!!busy || !!selectedAgentId || !agents.length} onChange={event => setAgentChoice(event.target.value)}>{!agents.length && <option value="">Create an agent below</option>}{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label>Maximum budget · test USDC<input value={budget} onChange={event => setBudget(event.target.value)} inputMode="decimal" required disabled={!!busy}/></label><button className={s.primary} disabled={!!busy || !agentId || !instruction.trim()}>{busy === 'create' ? 'Creating task…' : 'Create task'}<ArrowRight size={16} aria-hidden="true"/></button></div>
      <p className={t.hint}>Planning does not authorize payment. Execution needs your funded private task runner and an existing spending policy.</p>
      {profiles.length > 0 && <details className={t.examples}><summary>Explore available capabilities</summary>{profiles.slice(0, 8).map(profile => <button type="button" key={profile.serviceHash} onClick={() => {setInstruction(`Use the ${profile.title} service (${profile.serviceHash}) to: `); textRef.current?.focus();}} disabled={!!busy}><strong>{profile.title}</strong><span>{profile.description}</span></button>)}</details>}
    </form>
    <div className={t.heading}><h3>Your tasks</h3><button className={s.secondary} onClick={() => setRefresh(value => value + 1)} disabled={loading || !!busy}><RefreshCw size={14} aria-hidden="true"/>Refresh tasks</button></div>
    {error && <p role="alert" className={s.error}>{error}</p>}
    {loading ? <p role="status" className={t.hint}>Loading tasks…</p> : !tasks.length ? <p className={t.empty}>Your requests, approved plans, and paid results will appear here.</p> : tasks.map(task => <article key={task.id} className={t.task} aria-label={task.instruction}>
      <div className={t.heading}><h3>{task.instruction}</h3><span className={s.tag}>{labels[task.status]}</span></div>
      <p className={t.hint}>Budget {money(task.budgetAtomic)} · Updated {new Date(task.updatedAt).toLocaleString()}</p>
      {(task.status === 'queued' || task.status === 'approved') && <p className={t.waiting}>Waiting for your private task runner to claim this task. Keep it running with this agent’s credentials. <a href="https://github.com/saiisback/obolos/blob/main/docs/task-runner.md" target="_blank" rel="noreferrer">Task runner setup</a></p>}
      {task.status === 'planning' && <p role="status">Your runner is finding suitable services. A paid plan still requires your approval.</p>}
      {task.error && <p className={t.waiting} role="status">{task.error}</p>}
      {task.status === 'blocked' && <p className={t.hint}>Check the reason above and your runner before retrying. Retry keeps this task and any existing paid order IDs. <Link href="/app/marketplace">Browse available services</Link></p>}
      {task.plan && <div className={t.plan}><div className={t.heading}><h4>{task.plan.summary}</h4><strong>{money(task.plan.totalAtomic)} total</strong></div><ol>{task.plan.steps.map((step, index) => {
        const result = task.steps.find(value => value.index === index);
        return <li key={index}><div className={t.heading}><strong>{profiles.find(profile => profile.serviceHash === step.serviceHash)?.title ?? `${step.definition.category} · ${step.definition.unit}`}</strong><span>{money(BigInt(step.definition.quantity) * BigInt(step.definition.unitPriceAtomic))}</span></div><p className={t.hint}>Provider <a href={`https://testnet.arcscan.app/address/${step.definition.seller}`} target="_blank" rel="noreferrer">{step.definition.seller}</a></p><details open={task.status === 'needs_approval'}><summary>Input and routing</summary><p className={t.hint}>A $from reference uses an earlier step’s output: 0 is step 1, followed by the field path.</p><pre>{JSON.stringify(step.input, null, 2)}</pre></details><details><summary>Pinned service terms</summary><pre>{JSON.stringify(step.definition, null, 2)}</pre></details>{result && <div className={t.result}><h4>{index === task.plan!.steps.length - 1 ? 'Final output' : 'Step output'}</h4><pre>{JSON.stringify(result.output, null, 2)}</pre><a href={`https://testnet.arcscan.app/tx/${result.transactionHash}`} target="_blank" rel="noreferrer">Payment receipt · step {index + 1}</a><details><summary>Order evidence</summary><p>Order <code>{result.orderId}</code></p><p>Output hash <code>{result.outputHash}</code></p></details></div>}</li>;
      })}</ol>{task.approvalExpiresAt && <p className={t.hint}>Approval expires {new Date(task.approvalExpiresAt).toLocaleString()}.</p>}{task.planHash && <details><summary>Plan fingerprint</summary><code>{task.planHash}</code></details>}</div>}
      <div className={t.actions}>{task.status === 'needs_approval' && task.planHash && <button className={s.primary} disabled={!!busy} onClick={() => void act(task, 'approve')}>{busy === task.id ? 'Approving…' : `Approve ${money(task.plan!.totalAtomic)}`}</button>}{task.status === 'blocked' && <button className={s.secondary} disabled={!!busy} onClick={() => void act(task, 'retry')}>{busy === task.id ? 'Retrying…' : 'Retry this task'}</button>}{['queued', 'planning', 'needs_approval'].includes(task.status) && <button className={s.textButton} disabled={!!busy} onClick={() => void act(task, 'cancel')}>Cancel task</button>}</div>
    </article>)}
  </section>;
}
