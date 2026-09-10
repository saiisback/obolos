import { ArrowUpRight, Check, Clock3 } from 'lucide-react';
import { PlatformShell } from '@/components/platform/shell';
// Public release snapshot is bundled with the app; docs/ is excluded from deployment.
import record from '@/lib/evidence/marketplace-testnet.json';
import s from './evidence.module.css';

export const metadata = {
  title: 'Evidence | Obolos',
  description: 'Inspect a captured Obolos testnet run, its receipts, checks, and payment proofs.',
};

const repositoryRecord = 'https://github.com/saiisback/obolos/blob/main/docs/evidence/2026-09-10-marketplace-testnet.md';
const jsonRecord = 'https://github.com/saiisback/obolos/blob/main/docs/evidence/2026-09-10-marketplace-testnet.json';

function compact(value: string, lead = 12, tail = 10) {
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

function utcTime(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  }).format(new Date(value));
}

export default function EvidencePage() {
  const run = record.job.result;
  const [hederaReceipt, arcReceipt] = run.receipts;
  const service = run.mandate.verificationService;

  return <PlatformShell active="evidence">
    <main id="main" className={s.page}>
      <section className={s.hero}>

        <h1>Follow the work.<br /><em>Verify the payment.</em></h1>
        <p className={s.intro}>One captured testnet run, from a buyer&apos;s signed limits to a seller&apos;s onchain receipt. Every value below comes from the retained release record.</p>
      </section>
        <div className={s.captureNote}>
          <Clock3 className={s.captureIcon} size={18} aria-hidden="true" />
          <p><strong>Captured at {utcTime(record.testedAt)}</strong>This is a fixed release artifact, not a live network query or balance.</p>
          <a href={jsonRecord}>Open evidence JSON <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>

      <section className={s.outcomes} aria-label="Run outcome">
        <div><span>Run state</span><strong><i /> {record.job.status}</strong></div>
        <div><span>Receipt verification</span><strong><i /> {record.job.receiptVerification}</strong></div>
        <div><span>Receipts</span><strong>{run.receipts.length}</strong></div>
        <div><span>Checks passed</span><strong>{run.report.checks.filter(check => check.passed).length} / {run.report.checks.length}</strong></div>
      </section>

      <nav className={s.index} aria-label="Evidence sections"><a href="#receipts">Payment receipts</a><a href="#scope">Signed scope</a><a href="#execution">Execution trail</a><a href="#checks">Verifier checks</a><a href="#integrity">Record integrity</a></nav>

      <section id="receipts" className={s.section}>
        <div className={s.sectionHead}><p>Payment proof</p><h2>Two receipts.<br />Two test networks.</h2></div>
        <div className={s.receipts}>
          <article>
            <div className={s.receiptTop}><span>Source evidence</span><b>SETTLED</b></div>
            <strong className={s.amount}>0.001 <small>HBAR</small></strong>
            <dl><div><dt>Network</dt><dd>Hedera testnet</dd></div><div><dt>Transaction</dt><dd title={hederaReceipt.transactionId}>{compact(hederaReceipt.transactionId)}</dd></div><div><dt>Purchased</dt><dd>{hederaReceipt.units} source record</dd></div></dl>
            <a href={hederaReceipt.explorerUrl}>Inspect on HashScan <ArrowUpRight size={14} aria-hidden="true" /></a>
          </article>
          <article>
            <div className={s.receiptTop}><span>Seller verification</span><b>SETTLED</b></div>
            <strong className={s.amount}>0.05 <small>test USDC</small></strong>
            <dl><div><dt>Network</dt><dd>Arc testnet</dd></div><div><dt>Transaction</dt><dd title={arcReceipt.transactionId}>{compact(arcReceipt.transactionId)}</dd></div><div><dt>Recipient</dt><dd title={service.recipient}>{compact(service.recipient)}</dd></div></dl>
            <a href={arcReceipt.explorerUrl}>Inspect on ArcScan <ArrowUpRight size={14} aria-hidden="true" /></a>
          </article>
        </div>
        <p className={s.totalNote}>Successful run principal: <strong>0.001 HBAR + 0.05 test USDC</strong>, excluding network fees and inference cost.</p>
      </section>

      <section id="scope" className={s.section}>
        <div className={s.sectionHead}><p>Signed scope</p><h2>The buyer chose the work.<br />The seller chose the price.</h2></div>
        <div className={s.roles}>
          <article><span>Buyer</span><h3>One repository, one run</h3><p>Authorized up to 0.001 HBAR for source evidence and selected a specific verification service capped at 0.05 test USDC.</p><code>Separate signed EOA fixture</code></article>
          <article><span>Selected seller</span><h3>{service.name}</h3><p>Revision {service.revision} was signed into the mandate with its exact recipient and price. Payment went directly to that wallet.</p><code>{service.recipient}</code></article>
          <article><span>Execution</span><h3>Hosted metric verifier</h3><p>Obolos ran the verifier against canonical metric rows and paid provenance. Narrative judgment was outside the certified scope.</p><code>{service.id}</code></article>
        </div>
      </section>

      <section id="execution" className={s.section}>
        <div className={s.sectionHead}><p>Execution trail</p><h2>From mandate<br />to checked evidence.</h2></div>
        <ol className={s.timeline}>
          {run.events.map((event, index) => <li key={event.id}>
            <span className={s.step}>{String(index + 1).padStart(2, '0')}</span>
            <div><p>{event.actor} · {utcTime(event.timestamp)}</p><h3>{event.title}</h3><span>{event.detail}</span></div>
            <Check size={16} aria-label={event.kind === 'success' ? 'Passed' : 'Recorded'} />
          </li>)}
        </ol>
      </section>

      <section id="checks" className={s.section}>
        <div className={s.sectionHead}><p>Verifier result</p><h2>Seven checks.<br />Every one passed.</h2></div>
        <div className={s.checks}>
          {run.report.checks.map((check, index) => <article key={check.label}>
            <span>{String(index + 1).padStart(2, '0')}</span><div><h3>{check.label}</h3><p>{check.detail}</p></div><b>PASS</b>
          </article>)}
        </div>
      </section>

      <section id="integrity" className={s.integrity}>
        <div><h2>Keep the identifiers.<br />Recheck the trail.</h2><p>The saved order is fulfilled and the report digest binds it to the checked result. Confirming the same order twice produced zero additional transfers.</p></div>
        <dl>
          <div><dt>Job</dt><dd>{record.job.id}</dd></div>
          <div><dt>Order</dt><dd>{record.order.id}</dd></div>
          <div><dt>Report digest</dt><dd>{record.order.reportDigest}</dd></div>
          <div><dt>Deployment commit</dt><dd>{record.deploymentCommit}</dd></div>
          <div><dt>Confirmation replay</dt><dd>{record.confirmationReplay.repeats} confirmations · {record.confirmationReplay.additionalTransfers} additional transfers</dd></div>
        </dl>
      </section>

      <section className={s.negative}>
        <p>Negative verification history</p>
        <h2>A paid check can still fail.</h2>
        <div><p>An earlier, distinct run paid 0.001 HBAR and 0.05 test USDC, then failed claim-scope verification because the model added numeric metric claims outside the required rows. Its result, receipts, checks, and fulfilled order remain preserved; no payment was repeated or erased.</p><a href={repositoryRecord}>Read the full release record <ArrowUpRight size={14} aria-hidden="true" /></a></div>
      </section>
    </main>
  </PlatformShell>;
}
