'use client';

import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect, useState, type ReactNode} from 'react';
import {api, errorMessage, type User} from './api';
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
      if (!account.user) { router.replace(`/login?next=${encodeURIComponent(workspaceReturnPath(pathname))}`); return; }
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

  return <div className={`${s.shell} ${w.shell}`}>
    <a className={s.skip} href="#main">Skip to content</a>
    <header className={w.header}>
      <Link className={s.brand} href="/app" aria-label="Obolos workspace"><img src="/brand/obolos-symbol-black.png" width={38} height={38} alt="" />obolos</Link>
      <nav className={w.navigation} aria-label="Workspace navigation">{workspaceLinks.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}</nav>
      {user && <div className={w.account}><span title={user.address}>{user.address.slice(0,6)}…{user.address.slice(-4)}</span><button onClick={logout} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div>}
    </header>
    {error && <div className={w.error} role="alert"><p>{error}</p><button className={s.secondary} onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
    {loading ? <main id="main" className={s.main}><p className={s.empty} role="status">Loading your workspace…</p></main> : user ? children : !error ? <main id="main" className={s.main}><p className={s.empty} role="status">Opening wallet sign-in…</p></main> : null}
    <footer className={w.footer}><span>Your workspace · Hedera + Arc testnets</span><Link href="/app/evidence">Your execution evidence</Link><Link href="/app/developers">Your API credentials</Link></footer>
  </div>;
}
