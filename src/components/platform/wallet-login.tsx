'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, errorMessage, type User } from './api';
import s from './platform.module.css';
import {workspaceReturnPath} from '@/lib/platform/workspace-navigation';
const returnPath = () => workspaceReturnPath(new URLSearchParams(window.location.search).get('next'));

type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
type Wallet = { info: { uuid: string; name: string }; provider: Provider };

export function WalletLogin() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function checkAccount() {
    setLoading(true); setError('');
    try {
      const result = await api<{ user: User | null; configured: boolean }>('/api/account');
      setConfigured(result.configured);
      if (result.user) router.replace(returnPath());
    } catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void checkAccount();
    function announce(event: Event) {
      const wallet = (event as CustomEvent<Wallet>).detail;
      if (!wallet?.info?.uuid || typeof wallet.info.name !== 'string' || typeof wallet.provider?.request !== 'function') return;
      setWallets(current => current.some(w => w.info.uuid === wallet.info.uuid || w.provider === wallet.provider) ? current : [...current.filter(w => w.info.uuid !== 'injected-fallback'), wallet]);
    }
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const fallback = window.setTimeout(() => {
      const provider = (window as Window & { ethereum?: Provider }).ethereum;
      if (provider?.request) setWallets(current => current.length ? current : [{ info: { uuid: 'injected-fallback', name: 'Browser wallet' }, provider }]);
    }, 300);
    return () => { window.clearTimeout(fallback); window.removeEventListener('eip6963:announceProvider', announce); };
    // Account lookup and provider subscriptions are mounted once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(wallet: Wallet) {
    setBusy(true); setError(''); setMessage('');
    try {
      setStage('Choose an account in your wallet.');
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[\da-f]{40}$/i.test(accounts[0])) throw new Error('Your wallet did not return an EVM account.');
      const address = accounts[0];
      setStage('Preparing your sign-in message…');
      const challenge = await api<{ message: string }>('/api/auth/challenge', { method: 'POST', body: JSON.stringify({ address }) });
      setMessage(challenge.message);
      setStage('Review and sign the message in your wallet. No transaction is requested.');
      const encoded = '0x' + Array.from(new TextEncoder().encode(challenge.message), byte => byte.toString(16).padStart(2, '0')).join('');
      const signature = await wallet.provider.request({ method: 'personal_sign', params: [encoded, address] });
      if (typeof signature !== 'string') throw new Error('Your wallet did not return a signature.');
      setStage('Verifying your signature…');
      await api('/api/auth/verify', { method: 'POST', body: JSON.stringify({ signature }) });
      router.replace(returnPath());
    } catch (e) {
      const code = typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
      setError(code === 4001 ? 'You canceled the wallet request. Choose your wallet to try again.' : errorMessage(e));
      setStage('');
    } finally { setBusy(false); }
  }

  return <main id="main" className={s.loginMain}><div className={s.loginIntro}><p className={s.eyebrow}>Your wallet is your account</p><h1>Make room<br />for your agents.</h1><p>Sign a message to open your workspace. Then create agents, define their budgets, and manage API access.</p><p className={s.caption}>Sign-in proves wallet ownership. It does not transfer funds or authorize agent spending.</p></div><section className={s.loginPanel} aria-labelledby="wallet-heading"><span className={s.tag}>Testnet workspace</span><h2 id="wallet-heading">Connect your wallet</h2><p>Choose an installed EVM wallet. You’ll review a sign-in message tied to this site and Arc testnet (chain 5042002).</p>
    {loading ? <p role="status">Checking account availability…</p> : !configured ? <div className={s.notice}><strong>Account service unavailable</strong><p>This deployment needs its account database and sign-in configuration before you can continue.</p><button className={s.secondary} onClick={checkAccount}>Check again</button></div> : wallets.length === 0 ? <div className={s.notice}><strong>No browser wallet detected</strong><p>Open this page in your wallet’s browser or enable an EVM wallet extension, then reload.</p><button className={s.secondary} onClick={() => window.location.reload()}>Check for a wallet</button></div> : <div className={s.walletList}>{wallets.map(wallet => <button key={wallet.info.uuid} disabled={busy} className={s.walletButton} onClick={() => signIn(wallet)}><span>{wallet.info.name}</span><span aria-hidden="true">↗</span></button>)}</div>}
    {stage && <p role="status" className={s.notice}>{stage}</p>}{error && <p role="alert" className={s.error}>{error}</p>}
    {message && <details className={s.messageDetails}><summary>View exact sign-in message</summary><pre>{message}</pre></details>}
    <p className={s.caption}>Only a wallet signature is needed. Your private key stays in your wallet.</p><Link className={s.textLink} href="/developers#authentication">How authentication works ↗</Link>
  </section></main>;
}
