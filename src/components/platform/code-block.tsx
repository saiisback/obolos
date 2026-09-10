'use client';
import {useState} from 'react';
import {Check,Copy} from 'lucide-react';
import s from './code-block.module.css';
export function CodeBlock({code,label='Terminal'}:{code:string;label?:string}){const [status,setStatus]=useState('');async function copy(){try{await navigator.clipboard.writeText(code);setStatus('Copied');}catch{setStatus('Select the text to copy');}}return <div className={s.block}><div className={s.bar}><span>{label}</span><button type="button" onClick={copy} aria-label={`Copy ${label} example`}>{status==='Copied'?<Check size={13}/>:<Copy size={13}/>}<span>{status||'Copy'}</span></button></div><pre><code>{code}</code></pre><span className={s.status} role="status">{status}</span></div>;}
