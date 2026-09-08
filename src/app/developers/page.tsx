import Link from 'next/link';
import { PlatformShell } from '@/components/platform/shell';
import s from '@/components/platform/platform.module.css';

const setup = `export OBOLOS_URL="https://obolos.app"
export AGENT_ID="your-agent-id"
# Paste the one-time credential from your workspace.
read -r -s OBOLOS_API_KEY
export OBOLOS_API_KEY`;
const list = `curl --fail-with-body \\
  "$OBOLOS_URL/api/v1/agents/$AGENT_ID/runs" \\
  -H "Authorization: Bearer $OBOLOS_API_KEY"`;
const create = `curl --fail-with-body -X POST \\
  "$OBOLOS_URL/api/v1/agents/$AGENT_ID/runs" \\
  -H "Authorization: Bearer $OBOLOS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: repo-review-001" \\
  --data '{"repos":["octocat/Hello-World"]}'`;
const detail = `export RUN_ID="job-id-returned-by-the-api"
curl --fail-with-body \\
  "$OBOLOS_URL/api/v1/agents/$AGENT_ID/runs/$RUN_ID" \\
  -H "Authorization: Bearer $OBOLOS_API_KEY"`;

export default function DevelopersPage() {
  return <PlatformShell active="developers"><main id="main" className={s.main}><header className={s.docsHeading}><p className={s.eyebrow}>Developer guide</p><h1>Build around<br />clear permissions.</h1><p>One agent per credential. Separate allowances for research data and verification. Testnet infrastructure with explicit execution prerequisites.</p><Link href="/login" className={s.primary}>Create an agent ↗</Link></header><div className={s.docsLayout}><nav className={s.docsNav} aria-label="Developer guide sections"><a href="#quickstart">Quickstart</a><a href="#runs">Run API</a><a href="#runner">Execution prerequisites</a><a href="#authentication">Authentication</a><a href="#errors">Errors and limits</a></nav><div className={s.docsContent}>
    <section id="quickstart"><h2>Start with an agent</h2><p><Link href="/login">Sign in with your wallet</Link>, create an agent in your workspace, and issue an API credential from its credential panel. Copy both the agent ID and the one-time secret.</p><p>Set the deployment URL and your agent ID below. Run these commands in Bash or Zsh; <code>read -s</code> accepts your credential without displaying it or putting it in shell history.</p><pre><code>{setup}</code></pre><p>Keep credentials in server-side environment variables. They expire after 30 days and can be revoked immediately from your workspace.</p></section>
    <section id="runs"><h2>Read and request jobs</h2><h3>List your agent’s jobs</h3><pre><code>{list}</code></pre><p>The credential can access only its own agent. An empty job list means no work has been queued.</p><h3>Request a research run</h3><pre><code>{create}</code></pre><div className={s.notice}><strong>Current response: HTTP 409 · RUNNER_REQUIRED</strong><p>Self-service payment execution is not enabled. This request does not use an operator wallet, move funds, or create a simulated run.</p></div><p>Send a stable <code>Idempotency-Key</code> for retries of the same request. Use a new key for a new job. Repository identifiers use the <code>owner/repository</code> format.</p><h3>Inspect a specific job</h3><pre><code>{detail}</code></pre><p>Use a real job ID returned by the API after execution becomes available. Jobs remain scoped to the credential’s agent.</p></section>
    <section id="runner"><h2>Before an agent can spend</h2><p>Creating an agent and issuing a credential prepare your account. Payment execution remains unavailable until the following controls are implemented and configured for your workspace:</p><ul><li>An isolated execution environment with your own testnet payment configuration.</li><li>A signed spending mandate with independently checked limits.</li><li>Atomic budget reservations and durable payment intents.</li><li>Receipt reconciliation before an uncertain payment can be retried.</li></ul><p>Wallet sign-in grants no spending authority. Existing operator credentials are never shared with your agents. No runner-pairing command is available in this preview.</p><p>For the existing operator demonstration, open <Link href="/demo">the demo workspace</Link>. It has separate authorization and requires its local data service and broker for live execution.</p></section>
    <section id="authentication"><h2>Wallet sign-in and API access</h2><p>The browser discovers installed EVM wallets, requests an account, and fetches a sign-in challenge. The wallet signs the exact message with <code>personal_sign</code>.</p><p>The challenge is bound to this deployment’s origin, your address, Arc testnet chain 5042002, and a five-minute nonce. Verification creates a seven-day session in an HttpOnly cookie. Signing out revokes that session.</p><div className={s.endpointList}><p><code>POST /api/auth/challenge</code><span>JSON: <code>{'{"address":"0x…"}'}</code> → sign-in message</span></p><p><code>POST /api/auth/verify</code><span>JSON: <code>{'{"signature":"0x…"}'}</code> → account session</span></p><p><code>GET /api/account</code><span>Account identity and service availability</span></p><p><code>POST /api/auth/logout</code><span>Revoke the current session</span></p></div><p>Account, agent creation, and credential management endpoints use the browser session. The <code>/api/v1/agents/:id/runs</code> endpoints use a Bearer credential scoped to that agent.</p></section>
    <section id="errors"><h2>Errors and budget units</h2><p>Errors return JSON with <code>error</code> and <code>code</code> fields. Handle non-2xx responses before reading a success payload.</p><pre><code>{'{"error":"Payment execution requires an isolated runner.","code":"RUNNER_REQUIRED"}'}</code></pre><p className={s.caption}>Example error shape; the explanatory message may vary.</p><p>Agent budgets are integers in atomic units: 100,000,000 tinybar = 1 HBAR; 1,000,000 micro-USDC = 1 test USDC. Each per-run budget is capped at one token.</p><p>The workspace converts your decimal input exactly. Integrations should use integer arithmetic and keep HBAR and USDC separate.</p></section>
  </div></div></main></PlatformShell>;
}
