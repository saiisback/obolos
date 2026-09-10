import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './platform.module.css';

export function PlatformShell({ children, active }: { children: ReactNode; active?: string }) {
  return <div className={s.shell}>
    <a className={s.skip} href="#main">Skip to content</a>
    <header className={s.header}>
      <Link href="/" className={s.brand} aria-label="Obolos home"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>obolos</Link>
      <nav aria-label="Main navigation" className={s.nav}>
        <Link href="/marketplace" aria-current={active === 'marketplace' ? 'page' : undefined}>Marketplace</Link>
        <Link href="/developers" aria-current={active === 'developers' ? 'page' : undefined}>Developers</Link>
        <Link href="/demo" aria-current={active === 'demo' ? 'page' : undefined}>Operator demo</Link>
      </nav>
      <Link className={s.headerAction} href="/app">Open workspace <span aria-hidden="true">↗</span></Link>
    </header>
    {children}
    <footer className={s.footer}><Link href="/" className={s.brand}>obolos</Link><p>Work, within limits.</p><span>Hedera + Arc · Testnet only</span><Link href="/developers">API documentation ↗</Link></footer>
  </div>;
}
