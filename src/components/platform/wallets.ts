'use client';
import { useEffect, useState } from 'react';

export type BrowserWallet = { info: { uuid: string; name: string }; provider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } };
export function useBrowserWallets() {
  const [wallets, setWallets] = useState<BrowserWallet[]>([]);
  useEffect(() => {
    const announce = (event: Event) => {
      const wallet = (event as CustomEvent<BrowserWallet>).detail;
      if (!wallet?.info?.uuid || typeof wallet.info.name !== 'string' || typeof wallet.provider?.request !== 'function') return;
      setWallets(current => current.some(item => item.info.uuid === wallet.info.uuid || item.provider === wallet.provider) ? current : [...current.filter(item => item.info.uuid !== 'fallback'), wallet]);
    };
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const timer = window.setTimeout(() => {
      const provider = (window as Window & { ethereum?: BrowserWallet['provider'] }).ethereum;
      if (provider?.request) setWallets(current => current.length ? current : [{ info: { uuid: 'fallback', name: 'Browser wallet' }, provider }]);
    }, 300);
    return () => { window.clearTimeout(timer); window.removeEventListener('eip6963:announceProvider', announce); };
  }, []);
  return wallets;
}
export async function signOwnerMessage(wallet: BrowserWallet, owner: string, message: string) {
  const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== owner.toLowerCase()) throw new Error('Choose the wallet account that owns this workspace, then try signing again.');
  const bytes = '0x' + Array.from(new TextEncoder().encode(message), byte => byte.toString(16).padStart(2, '0')).join('');
  const signature = await wallet.provider.request({ method: 'personal_sign', params: [bytes, accounts[0]] });
  if (typeof signature !== 'string') throw new Error('The wallet did not return a signature.');
  return signature;
}
