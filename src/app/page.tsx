import Image from 'next/image';
import Link from 'next/link';
import { PlatformShell } from '@/components/platform/shell';
import s from '@/components/platform/platform.module.css';

export default function Home() {
  return <PlatformShell><main id="main" className={s.main}>
    <section className={s.hero}>
      <div className={s.heroText}><p className={s.eyebrow}>An agent workspace. A human-defined budget.</p><h1>Give your agents<br />a spending limit.</h1><p className={s.lead}>Set up research agents with separate budgets for data and verification. Keep the keys, permissions, and payment evidence in view.</p><div className={s.actions}><Link className={s.primary} href="/login">Create your workspace <span aria-hidden="true">↗</span></Link><Link className={s.textLink} href="/developers">Explore the API</Link></div><p className={s.caption}>Testnet preview · Account setup requires a connected database.<br />Self-service payment execution is not yet enabled.</p></div>
      <figure className={s.heroArt}><div className={s.artFrame}><Image src="/illustrations/agent-workforce.png" alt="Three robot coworkers exchange a payment token and a research report." width={1536} height={1024} sizes="(max-width: 800px) 100vw, 50vw" preload /></div><figcaption><span>A small workforce. Clear boundaries.</span><span>Obolos research agents</span></figcaption></figure>
    </section>
    <section className={s.editorial} aria-labelledby="limits-heading"><div><p className={s.eyebrow}>You define the allowance.</p><h2 id="limits-heading">Two budgets.<br />One clear mandate.</h2><p>Research data and verification are different purchases. Keep their allowances separate, down to the smallest unit.</p><Link href="/login" className={s.textLink}>Set up an agent ↗</Link></div><div className={s.allowances}><div><span>Research data</span><strong>HBAR</strong><p>Hedera testnet · Up to 1 HBAR per run</p></div><div><span>Verification</span><strong>USDC</strong><p>Arc testnet · Up to 1 test USDC per run</p></div><p className={s.caption}>Saving a budget creates configuration. Payment execution also requires an isolated runner and a signed spending mandate.</p></div></section>
    <section className={s.developerFeature}><div><p className={s.eyebrow}>Built for your workflow</p><h2>An agent.<br />A scoped API key.<br />Your integration.</h2><p>Create credentials for one agent, revoke them from your workspace, and inspect that agent’s jobs through the API.</p><Link className={s.primary} href="/developers">Read the developer guide ↗</Link></div><div className={s.codePanel}><div className={s.codeLabel}>List this agent’s jobs</div><pre><code>{`curl "$OBOLOS_URL/api/v1/agents/$AGENT_ID/runs" \\\n  -H "Authorization: Bearer $OBOLOS_API_KEY"`}</code></pre><p>Credentials expire after 30 days. New runs return <code>RUNNER_REQUIRED</code> until payment execution is configured.</p></div></section>
    <section className={s.finalCta}><h2>Start with the boundaries.</h2><div><p>Connect a wallet to create your account, then define your first research agent.</p><Link href="/login" className={s.primary}>Create your workspace ↗</Link></div></section>
  </main></PlatformShell>;
}
