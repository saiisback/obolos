'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect, useState, type ReactNode} from 'react';
import {api, errorMessage, type User} from './api';
import {Bot, Store, ChartNoAxesCombined, ReceiptText, Code2, LogOut} from 'lucide-react';
import {workspaceLinks, workspaceReturnPath} from '@/lib/platform/workspace-navigation';
import s from './platform.module.css';
import w from './workspace-shell.module.css';

export function WorkspaceShell({children}: {children: ReactNode}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setUser(null);
    void api<{user: User | null; configured: boolean}>('/api/account', {signal: controller.signal}).then(account => {
      if (controller.signal.aborted) return;
      if (!account.configured) { setError('Account service needs configuration. Please try again later.'); return; }
      if (!account.user) { router.replace(`/login?next=${encodeURIComponent(workspaceReturnPath(pathname + window.location.search))}`); return; }
      setUser(account.user);
    }).catch(caught => { if (!controller.signal.aborted) setError(errorMessage(caught)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [pathname, router, attempt]);

  async function logout() {
    setSigningOut(true); setError('');
    try { await api('/api/auth/logout', {method: 'POST'}); setUser(null); router.replace('/login'); }
    catch (caught) { setError(errorMessage(caught)); setSigningOut(false); }
  }

  return <div className={w.shell}>
    <a className={s.skip} href="#main">Skip to content</a>
    <aside className={w.sidebar}>
      <Link className={s.brand} href="/app" aria-label="Obolos workspace"><img src="/brand/obolos-symbol-white.png" width={32} height={32} alt="" />obolos</Link>
      <nav className={w.navigation} aria-label="Workspace navigation">{workspaceLinks.map((link, index) => {
        const Icon = [Bot, Store, ChartNoAxesCombined, ReceiptText, Code2][index];
        return <Link key={link.href} href={link.href} aria-label={link.label} aria-current={pathname === link.href ? 'page' : undefined}><Icon size={18} aria-hidden="true"/><span>{link.label}</span></Link>;
      })}</nav>
      <div className={w.sidebarNote}><span className={w.networkDot} aria-hidden="true"/><strong>Testnet</strong><p>Hedera · Arc</p></div>
    </aside>
    <div className={w.content}>
    <header className={w.header}>
      <span>Workspace <span aria-hidden="true">/</span> <strong>{workspaceLinks.find(link => link.href === pathname)?.label || 'Agents'}</strong></span>
      {user && <div className={w.account}><span title={user.address}>{user.address.slice(0,6)}…{user.address.slice(-4)}</span><button onClick={logout} disabled={signingOut}><LogOut size={15} aria-hidden="true"/>{signingOut ? 'Signing out…' : 'Sign out'}</button></div>}
    </header>
    {error && <div className={w.error} role="alert"><p>{error}</p><button className={s.secondary} onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
    {loading ? <main id="main" className={s.main}><p className={s.empty} role="status">Loading your workspace…</p></main> : user ? children : !error ? <main id="main" className={s.main}><p className={s.empty} role="status">Opening wallet sign-in…</p></main> : null}
    <footer className={w.footer}>Obolos · Testnet assets only. Spending requires your signed mandate.</footer>
    </div>
  </div>;
}
