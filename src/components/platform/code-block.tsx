'use client';

import {useEffect, useRef, useState} from 'react';
import {Check, Copy} from 'lucide-react';
import s from './code-block.module.css';

export function CodeBlock({code, label = 'Terminal'}: {code: string; label?: string}) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef<HTMLElement>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    setStatus('copying');
    try {
      await navigator.clipboard.writeText(code);
      setStatus('copied');
      timer.current = setTimeout(() => setStatus('idle'), 2500);
    } catch {
      if (codeRef.current) {
        const range = document.createRange();
        range.selectNodeContents(codeRef.current);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus('error');
    }
  }

  return <div className={s.block}>
    <div className={s.bar}><span>{label}</span><button type="button" onClick={copy} disabled={status === 'copying'} aria-label={`Copy ${label} example`}>
      {status === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span>{status === 'copied' ? 'Copied' : status === 'copying' ? 'Copying…' : 'Copy'}</span>
    </button></div>
    <pre tabIndex={0} aria-label={`${label} code`}><code ref={codeRef}>{code}</code></pre>
    {status === 'error' ? <p className={s.error} role="status">Clipboard unavailable. The code is selected; use your device’s Copy command, or try Copy again.</p> : <span className={s.status} role="status">{status === 'copied' ? `${label} copied to clipboard.` : ''}</span>}
  </div>;
}
