'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, errorMessage, type Agent, type ApiKeySummary } from './api';
import s from './platform.module.css';

export function Credentials({ agent, showIntegrationLink = true }: { agent: Agent; showIntegrationLink?: boolean }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const tokenRef = useRef<HTMLTextAreaElement>(null);
  async function load() {
    setLoading(true); setError('');
    try { const result = await api<{ keys: ApiKeySummary[] }>(`/api/agents/${agent.id}/keys`); setKeys(result.keys); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [agent.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (token) tokenRef.current?.focus(); }, [token]);
  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get('name')).trim();
    setBusy(true); setError('');
    try { const result = await api<{ key: ApiKeySummary; token: string }>(`/api/agents/${agent.id}/keys`, { method: 'POST', body: JSON.stringify({ name }) }); setKeys(current => [result.key, ...current]); setToken(result.token); setCopied(false); form.reset(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError('');
    try { await api(`/api/agents/${agent.id}/keys/${id}`, { method: 'DELETE' }); setKeys(current => current.map(key => key.id === id ? { ...key, revokedAt: new Date().toISOString() } : key)); setConfirmRevoke(null); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function copy() { try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setError('Clipboard access is unavailable. Select and copy the credential below.'); tokenRef.current?.select(); } }
  return <section id={`keys-${agent.id}`} className={s.credentials} aria-label={`API credentials for ${agent.name}`}><h3>Agent API credentials</h3><p>Each credential is scoped to this agent and expires after 30 days. Keep it on your server.</p>{error && <div role="alert" className={s.error}>{error}<button onClick={load} className={s.textButton} disabled={busy}>Reload credentials</button></div>}
    {token && <div className={s.tokenPanel}><h3>Copy your credential now</h3><p>This secret is shown only once. Closing these credentials or leaving the page hides it permanently.</p><textarea ref={tokenRef} readOnly value={token} aria-label="New API credential" rows={2} onFocus={event => event.target.select()} /><div className={s.actions}><button className={s.secondary} onClick={copy}>{copied ? 'Copied' : 'Copy credential'}</button><button className={s.textButton} onClick={() => setToken('')}>I saved it · Hide secret</button><span role="status">{copied ? 'Credential copied to clipboard.' : ''}</span></div></div>}
    <form onSubmit={issue} className={s.keyForm}><label htmlFor={`key-name-${agent.id}`}>Credential name<input id={`key-name-${agent.id}`} name="name" required maxLength={80} placeholder="Local development" disabled={busy || !!token} /></label><button className={s.primary} type="submit" disabled={busy || loading || !!token}>{busy ? 'Saving…' : 'Issue credential ↗'}</button></form>
    {loading ? <p role="status">Loading credentials…</p> : keys.length === 0 ? <p className={s.caption}>No credentials yet. Issue one when you’re ready to integrate.</p> : <ul className={s.keyList}>{keys.map(key => { const expired = new Date(key.expiresAt).getTime() <= Date.now(); return <li key={key.id}><div><strong>{key.name}</strong><code>{key.prefix}…</code><small>{key.revokedAt ? 'Revoked' : expired ? 'Expired' : `Expires ${new Date(key.expiresAt).toLocaleDateString()}`}</small></div>{!key.revokedAt && !expired && (confirmRevoke === key.id ? <div className={s.revokeConfirm}><span>Revoke immediately?</span><button className={s.dangerButton} onClick={() => revoke(key.id)} disabled={busy}>Revoke</button><button className={s.textButton} onClick={() => setConfirmRevoke(null)} disabled={busy}>Cancel</button></div> : <button className={s.textButton} onClick={() => setConfirmRevoke(key.id)} disabled={busy}>Revoke</button>)}</li>; })}</ul>}
    {showIntegrationLink && <Link className={s.textLink} href="/app/developers">Use this credential in your integration ↗</Link>}
  </section>;
}
