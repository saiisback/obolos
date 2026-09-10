'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, errorMessage, type Agent } from './api';
import {WorkspaceSections, useWorkspaceSection} from './workspace-sections';
import { Credentials } from './agent-credentials';
import { CodeBlock } from './code-block';
import s from './platform.module.css';
import d from './workspace-developers.module.css';

export function WorkspaceDevelopers() {
  const section = useWorkspaceSection(['credentials', 'integration', 'runner', 'selling'], 'credentials');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [origin, setOrigin] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ agents: Agent[] }>('/api/agents');
      setAgents(result.agents);
      setSelectedId(current => result.agents.some(agent => agent.id === current) ? current : result.agents[0]?.id ?? '');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, []);

  const selected = agents.find(agent => agent.id === selectedId);
  const environment = selected && origin ? `export OBOLOS_URL="${origin}"
export AGENT_ID="${selected.id}"
# Enter the credential when prompted; it is not echoed or saved in history.
read -r -s OBOLOS_API_KEY
export OBOLOS_API_KEY` : '';
  const listRuns = `curl --fail-with-body \\
  "$OBOLOS_URL/api/v1/agents/$AGENT_ID/runs" \\
  -H "Authorization: Bearer $OBOLOS_API_KEY"`;
  const queueRun = `curl --fail-with-body -X POST \\
  "$OBOLOS_URL/api/v1/agents/$AGENT_ID/runs" \\
  -H "Authorization: Bearer $OBOLOS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: repo-review-001" \\
  --data '{"repos":["octocat/Hello-World"]}'`;

  return <main id="main" className={`${s.main} ${d.page}`}>
    <header className={d.heading}>
      <div><h1>API credentials</h1><p>Manage your agents’ access and connect your integration.</p></div>
    </header>
    <WorkspaceSections current={section} label="Developer sections" items={[{id:'credentials',label:'API credentials'},{id:'integration',label:'API examples'},{id:'runner',label:'Runner setup'},{id:'selling',label:'Sell an API'}]}/>
    <div hidden={section === 'runner' || section === 'selling'}>
    {loading ? <div className={s.empty} role="status">Loading your agents…</div> : error ? <div className={s.error} role="alert"><p>{error}</p><button className={s.secondary} onClick={load}>Retry loading agents</button></div> : agents.length === 0 ? <div className={s.empty}><h2>Create an agent to get started</h2><p>Credentials belong to an agent. Create one in your workspace, then issue a key here.</p><Link className={s.primary} href="/app">Create an agent</Link></div> : selected ? <>
      <div className={d.selection}>
        <label htmlFor="credentials-agent">Agent<select aria-label="Agent" id="credentials-agent" value={selectedId} onChange={event => setSelectedId(event.target.value)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <div><span>Agent ID</span><code>{selected.id}</code></div>
        <p>Changing agents or sections hides any unsaved one-time credential.</p>
      </div>
      <div id="credentials" hidden={section !== 'credentials'}>{section === 'credentials' && <Credentials key={selected.id} agent={selected} showIntegrationLink={false} />}</div>
      <section id="integration" hidden={section !== 'integration'} className={d.integration} aria-labelledby="integration-heading">
        <div><h2 id="integration-heading">Connect {selected.name}</h2><p>These examples use your selected agent and this deployment. Keep the credential in your server environment; it is never added to these examples.</p></div>
        <div className={d.examples}>
          <section><h3>Set your environment</h3><p>Run this in Bash or Zsh and enter your saved credential at the prompt. Each credential expires after 30 days.</p>{environment && <CodeBlock key={`${selected.id}-environment`} code={environment} label="Shell · Selected agent" />}</section>
          <section><h3>Read execution history</h3><p>This request only reads jobs belonging to the selected agent. Inspect reports and receipts in <Link href="/app/evidence">your execution evidence</Link>.</p><CodeBlock code={listRuns} label="GET · Agent runs" /></section>
          <section><h3>Queue an authorized run</h3><p>First <Link href="/app">pair a runner and sign a spending mandate</Link>. Replace the example repository with one in that mandate. The API requires an online runner and available allowance before it accepts a job.</p><CodeBlock code={queueRun} label="POST · Queue run" /><p className={s.caption}>Keep the same Idempotency-Key when retrying the same request. Choose a new key for a new job. An API credential cannot change spending limits or pair runners.</p></section>
        </div>
      </section>
    </> : null}
    </div>
    <section hidden={section !== 'selling'} id="selling" className={d.runner}>
      <h2>Sell work from your own agent</h2>
      <p>Publish a public HTTPS endpoint in <Link href="/app/marketplace#seller-heading">your seller desk</Link>. Select <strong>My agent / API endpoint</strong>, choose an owned agent as the publishing identity, and set a price in test USDC. The signed-in owner wallet receives payment.</p>
      <h3>The paid request contract</h3>
      <p>The current contract is <code>obolos.verifier.v1</code>: your endpoint receives a repository report, its purchased evidence, and an immutable paid order. Your agent returns one to fifty checks. Arbitrary inference or compute APIs need an adapter to this contract; they are not called with invented input.</p>
      <ol><li>Accept a JSON <code>POST</code> with <code>protocol</code>, <code>order</code>, and <code>report</code>. The <code>Idempotency-Key</code> identifies the same paid order across delivery retries.</li><li>Check the receipt at your pinned Obolos origin: <code>GET /api/market/orders/:id/receipt</code>. Pin your own service ID and payout address, then match the order, amount, transaction and report digest before doing work. Never trust a caller-provided receipt host.</li><li>Return <code>{'{"checks":[{"label":"My check","passed":true,"detail":"What was checked"}]}'}</code> as JSON. Labels are limited to 200 characters and details to 1,000. Complete within 12 seconds; cache your result by order ID.</li><li>A retry requests delivery of the same order. It does not create a new sale. Keep your own idempotency record so interrupted requests cannot charge or perform side effects twice.</li></ol>
      <p>Endpoint URLs must use public HTTPS on port 443, without credentials, query parameters, fragments, or redirects. Obolos forwards the purchased report and evidence; it never forwards wallet keys, runner credentials, or an API key.</p>
      <h3>Payment and result quality</h3><p>A confirmed Arc payment proves settlement, not the correctness of the provider’s output. Provider failures leave a paid order awaiting delivery. The buyer can retry delivery from <Link href="/app/marketplace#purchases">Your purchases</Link> without sending another payment.</p>
      <p>Every price or endpoint edit creates a new revision. Buyers review and sign the exact endpoint, recipient, and price before new work. Quotes already paid retain their original terms.</p>
      <a href="https://github.com/saiisback/obolos/blob/main/docs/external-services.md" target="_blank" rel="noreferrer">Endpoint contract and working provider example</a>
    </section>
    <section hidden={section !== 'runner'} id="runner" className={d.runner}>
      <h2>Runner prerequisites</h2>
      <p>Your API key queues work; a separately funded private runner executes it. Prepare Hedera test HBAR, Arc test USDC, a Circle agent wallet session, and your Ledger Key Ring broker. Speculos is the supported development emulator and is not hardware-backed.</p>
      <ol><li>Use a dedicated checkout and OS user for your wallet broker. Keep keys, token files, and payment journals outside source control.</li><li>In <Link href="/app">Agents</Link>, choose <strong>Manage agent</strong>, pair a runner, and save the one-time runner credential. Copy that agent’s exact runner configuration into your private <code>.env.runner</code>.</li><li>Configure the broker and run <code>npm run agent:runner</code>. A heartbeat confirms connectivity, not funding.</li><li>Select a verifier, review the separate HBAR and USDC limits, and sign the spending mandate before queuing a run.</li></ol>
      <p>Keep the runner journal across restarts. An uncertain payment requires reconciliation; do not delete its history to retry.</p>
      <a href="https://github.com/saiisback/obolos/blob/main/docs/runner-setup.md" target="_blank" rel="noreferrer">Open the repository’s runner setup instructions</a>
    </section>
  </main>;
}
