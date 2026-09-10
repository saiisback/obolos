import {CinematicHeader,CinematicBackground} from './cinematic-header';
import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './platform.module.css';

export function PlatformShell({ children, active }: { children: ReactNode; active?: string }) {
  const cinematic=['marketplace','developers','evidence'].includes(active??'');
  return <div className={`${s.shell} ${cinematic?s.cinematic:''}`}>
    {cinematic&&<><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap"/><link rel="stylesheet" href="https://db.onlinewebfonts.com/c/8cb707a9b8a73f8a7403336b861c3074?family=BubbledotICG-FinePos"/><CinematicBackground/></>}
    <a className={s.skip} href="#main">Skip to content</a>
    {cinematic?<CinematicHeader active={active}/>:<header className={s.header}>
      <a href="/" className={s.brand} aria-label="Obolos home"><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>obolos</a>
      <nav aria-label="Main navigation" className={s.nav}>
        <Link href="/marketplace" aria-current={active === 'marketplace' ? 'page' : undefined}>Marketplace</Link>
        <Link href="/developers" aria-current={active === 'developers' ? 'page' : undefined}>Developers</Link>
        <Link href="/evidence" aria-current={active === 'evidence' ? 'page' : undefined}>Evidence</Link>
      </nav>
      <Link className={s.headerAction} href="/app">Open workspace <span aria-hidden="true">↗</span></Link>
    </header>}
    {children}
    <footer className={s.footer}><a href="/" className={s.brand}>obolos</a><p>Work, within limits.</p><span>Hedera + Arc · Testnet only</span><Link href="/evidence">Payment evidence ↗</Link><Link href="/developers">API documentation ↗</Link></footer>
  </div>;
}
